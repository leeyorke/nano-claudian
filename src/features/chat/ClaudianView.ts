import type { EventRef, WorkspaceLeaf } from 'obsidian';
import { ItemView, Notice, Scope, setIcon } from 'obsidian';

import type { ChatMessage } from '../../core/types';
import { getContextWindowSize, VIEW_TYPE_CLAUDIAN } from '../../core/types';
import { t } from '../../i18n';
import type ClaudianPlugin from '../../main';
import { SaveNoteModal } from '../../shared/modals/SaveNoteModal';
import { AvatarSettingsModal } from '../settings/ui/AvatarSettingsModal';
import { LOGO_SVG } from './constants';
import { TitleGenerationService } from './services/TitleGenerationService';
import { TabBar, TabManager, updatePlanModeUI } from './tabs';
import type { TabData, TabId } from './tabs/types';

export class ClaudianView extends ItemView {
  private plugin: ClaudianPlugin;

  // Tab management
  private tabManager: TabManager | null = null;
  private tabBar: TabBar | null = null;
  private tabBarContainerEl: HTMLElement | null = null;
  private tabContentEl: HTMLElement | null = null;
  private navRowContent: HTMLElement | null = null;

  // DOM Elements
  private viewContainerEl: HTMLElement | null = null;
  private headerEl: HTMLElement | null = null;
  private titleSlotEl: HTMLElement | null = null;
  private logoEl: HTMLElement | null = null;
  private titleTextEl: HTMLElement | null = null;
  private headerActionsEl: HTMLElement | null = null;
  private headerActionsContent: HTMLElement | null = null;

  // Header elements
  private historyDropdown: HTMLElement | null = null;

  // Event refs for cleanup
  private eventRefs: EventRef[] = [];

  // Debouncing for tab bar updates
  private pendingTabBarUpdate: number | null = null;

  // Debouncing for tab state persistence
  private pendingPersist: ReturnType<typeof setTimeout> | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ClaudianPlugin) {
    super(leaf);
    this.plugin = plugin;

    // Hover Editor compatibility: Define load as an instance method that can't be
    // overwritten by prototype patching. Hover Editor patches ClaudianView.prototype.load
    // after our class is defined, but instance methods take precedence over prototype methods.
    const originalLoad = Object.getPrototypeOf(this).load.bind(this);
    Object.defineProperty(this, 'load', {
      value: async () => {
        // Ensure containerEl exists before any patched load code tries to use it
        if (!this.containerEl) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (this as any).containerEl = createDiv({ cls: 'view-content' });
        }
        // Wrap in try-catch to prevent Hover Editor errors from breaking our view
        try {
          return await originalLoad();
        } catch {
          // Hover Editor may throw if its DOM setup fails - continue anyway
        }
      },
      writable: false,
      configurable: false,
    });
  }

  getViewType(): string {
    return VIEW_TYPE_CLAUDIAN;
  }

  getDisplayText(): string {
    return 'nano-claudian';
  }

  getIcon(): string {
    return 'bot';
  }

  /** Refreshes model-dependent UI across all tabs (used after settings/env changes). */
  refreshModelSelector(): void {
    const model = this.plugin.settings.model;
    const contextWindow = getContextWindowSize(model, this.plugin.settings.customContextLimits);

    for (const tab of this.tabManager?.getAllTabs() ?? []) {
      if (tab.state.usage) {
        const percentage = Math.min(100, Math.max(0, Math.round((tab.state.usage.contextTokens / contextWindow) * 100)));
        tab.state.usage = { ...tab.state.usage, model, contextWindow, percentage };
      }

      tab.ui.modelCommandBtn?.updateDisplay();
    }
  }

  /** Updates hidden slash commands on all tabs (used after settings change). */
  updateHiddenSlashCommands(): void {
    const hiddenCommands = new Set(
      (this.plugin.settings.hiddenSlashCommands || []).map(c => c.toLowerCase())
    );
    for (const tab of this.tabManager?.getAllTabs() ?? []) {
      tab.ui.slashCommandDropdown?.setHiddenCommands(hiddenCommands);
    }
  }

  async onOpen() {
    // Guard: Hover Editor and similar plugins may call onOpen before DOM is ready.
    // containerEl must exist before we can access contentEl or create elements.
    if (!this.containerEl) {
      return;
    }

    // Use contentEl (standard Obsidian API) as primary target.
    // Hover Editor and other plugins may modify the DOM structure,
    // so we need fallbacks to handle non-standard scenarios.
    let container: HTMLElement | null =
      this.contentEl ?? (this.containerEl.children[1] as HTMLElement | null);

    if (!container) {
      // Last resort: create our own container inside containerEl
      container = this.containerEl.createDiv();
    }

    this.viewContainerEl = container;
    this.viewContainerEl.empty();
    this.viewContainerEl.addClass('claudian-container');

    // Build header (logo only, tab bar and actions moved to nav row)
    const header = this.viewContainerEl.createDiv({ cls: 'claudian-header' });
    this.buildHeader(header);

    // Build nav row content (tab badges + header actions)
    this.navRowContent = this.buildNavRowContent();

    // Tab content container (TabManager will populate this)
    this.tabContentEl = this.viewContainerEl.createDiv({ cls: 'claudian-tab-content-container' });

    // Initialize TabManager
    this.tabManager = new TabManager(
      this.plugin,
      this.plugin.mcpManager,
      this.tabContentEl,
      this,
      {
        onTabCreated: () => {
          this.updateTabBar();
          this.updateNavRowLocation();
          this.persistTabState();
        },
        onTabSwitched: () => {
          this.updateTabBar();
          this.updateHistoryDropdown();
          this.updateNavRowLocation();
          this.persistTabState();
        },
        onTabClosed: () => {
          this.updateTabBar();
          this.persistTabState();
        },
        onTabStreamingChanged: () => this.updateTabBar(),
        onTabTitleChanged: () => this.updateTabBar(),
        onTabAttentionChanged: () => this.updateTabBar(),
        onTabConversationChanged: () => {
          this.persistTabState();
        },
      }
    );

    // Wire up view-level event handlers
    this.wireEventHandlers();

    // Restore tabs from persisted state or create default tab
    await this.restoreOrCreateTabs();

    // Apply initial layout based on tabBarPosition setting
    this.updateLayoutForPosition();
  }

  async onClose() {
    // Cancel any pending tab bar update
    if (this.pendingTabBarUpdate !== null) {
      cancelAnimationFrame(this.pendingTabBarUpdate);
      this.pendingTabBarUpdate = null;
    }

    // Cleanup event refs
    for (const ref of this.eventRefs) {
      this.plugin.app.vault.offref(ref);
    }
    this.eventRefs = [];

    // Persist tab state before cleanup (immediate, not debounced)
    await this.persistTabStateImmediate();

    // Destroy tab manager and all tabs
    await this.tabManager?.destroy();
    this.tabManager = null;

    // Cleanup tab bar
    this.tabBar?.destroy();
    this.tabBar = null;
  }

  // ============================================
  // UI Building
  // ============================================

  private buildHeader(header: HTMLElement) {
    this.headerEl = header;

    // Title slot container (logo + title or tabs)
    this.titleSlotEl = header.createDiv({ cls: 'claudian-title-slot' });

    // Logo (hidden when 2+ tabs)
    this.logoEl = this.titleSlotEl.createSpan({ cls: 'claudian-logo' });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', LOGO_SVG.viewBox);
    svg.setAttribute('width', LOGO_SVG.width);
    svg.setAttribute('height', LOGO_SVG.height);
    svg.setAttribute('fill', 'none');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', LOGO_SVG.path);
    path.setAttribute('fill', LOGO_SVG.fill);
    svg.appendChild(path);
    this.logoEl.appendChild(svg);

    // Title text (hidden in header mode when 2+ tabs)
    this.titleTextEl = this.titleSlotEl.createEl('h4', { text: 'nano-claudian', cls: 'claudian-title-text' });

    // Version text
    this.titleSlotEl.createEl('span', { text: this.plugin.manifest.version, cls: 'claudian-version-text' });

    // Right side container for all header actions
    const rightContainer = header.createDiv({ cls: 'claudian-header-right' });
    rightContainer.style.display = 'flex';
    rightContainer.style.alignItems = 'center';
    rightContainer.style.gap = '12px';
    rightContainer.style.marginInlineStart = 'auto';

    // Header actions container (for header mode - initially hidden)
    this.headerActionsEl = rightContainer.createDiv({ cls: 'claudian-header-actions-slot' });
    this.headerActionsEl.style.display = 'none';

    // Global actions container (always visible at top right)
    const globalActionsEl = rightContainer.createDiv({ cls: 'claudian-global-actions' });
    globalActionsEl.style.display = 'flex';
    globalActionsEl.style.alignItems = 'center';
    globalActionsEl.style.gap = '12px';

    // Avatar Settings button (gear icon)
    const settingsBtn = globalActionsEl.createDiv({ cls: 'claudian-header-btn' });
    setIcon(settingsBtn, 'settings');
    settingsBtn.setAttribute('aria-label', 'Avatar Settings');
    settingsBtn.addEventListener('click', () => {
      new AvatarSettingsModal(this.app, this.plugin).open();
    });
  }

  /**
   * Builds the nav row content (tab badges + header actions).
   * This is called once and the content is moved between locations.
   */
  private buildNavRowContent(): HTMLElement {
    // Create a fragment to hold nav row content
    const fragment = document.createDocumentFragment();

    // Tab badges (left side in nav row, or in title slot for header mode)
    this.tabBarContainerEl = document.createElement('div');
    this.tabBarContainerEl.className = 'claudian-tab-bar-container';
    this.tabBar = new TabBar(this.tabBarContainerEl, {
      onTabClick: (tabId) => this.handleTabClick(tabId),
      onTabClose: (tabId) => this.handleTabClose(tabId),
      onNewTab: () => this.handleNewTab(),
    });
    fragment.appendChild(this.tabBarContainerEl);

    // Header actions (right side)
    this.headerActionsContent = document.createElement('div');
    this.headerActionsContent.className = 'claudian-header-actions';

    // Save session button
    const saveSessionBtn = this.headerActionsContent.createDiv({ cls: 'claudian-header-btn' });
    setIcon(saveSessionBtn, 'file-down');
    saveSessionBtn.setAttribute('aria-label', t('chat.renderer.saveSession' as any));
    saveSessionBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        void this.saveSessionToNote();
    });

    // New tab button (plus icon)
    const newTabBtn = this.headerActionsContent.createDiv({ cls: 'claudian-header-btn claudian-new-tab-btn' });
    setIcon(newTabBtn, 'square-plus');
    newTabBtn.setAttribute('aria-label', 'New tab');
    newTabBtn.addEventListener('click', async () => {
      await this.handleNewTab();
    });

    // New conversation button (square-pen icon - new conversation in current tab)
    const newBtn = this.headerActionsContent.createDiv({ cls: 'claudian-header-btn' });
    setIcon(newBtn, 'square-pen');
    newBtn.setAttribute('aria-label', 'New conversation');
    newBtn.addEventListener('click', async () => {
      await this.tabManager?.createNewConversation();
      this.updateHistoryDropdown();
    });

    // History dropdown
    const historyContainer = this.headerActionsContent.createDiv({ cls: 'claudian-history-container' });
    const historyBtn = historyContainer.createDiv({ cls: 'claudian-header-btn' });
    setIcon(historyBtn, 'history');
    historyBtn.setAttribute('aria-label', 'Chat history');

    this.historyDropdown = historyContainer.createDiv({ cls: 'claudian-history-menu' });

    historyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleHistoryDropdown();
    });

    fragment.appendChild(this.headerActionsContent);

    // Create a wrapper div to hold the fragment (for input mode nav row)
    const wrapper = document.createElement('div');
    wrapper.style.display = 'contents';
    wrapper.appendChild(fragment);
    return wrapper;
  }

  /**
   * Moves nav row content based on tabBarPosition setting.
   * - 'input' mode: Both tab badges and actions go to active tab's navRowEl
   * - 'header' mode: Tab badges go to title slot (after logo), actions go to header right side
   */
  private updateNavRowLocation(): void {
    if (!this.tabBarContainerEl || !this.headerActionsContent) return;

    const isHeaderMode = this.plugin.settings.tabBarPosition === 'header';

    if (isHeaderMode) {
      // Header mode: Tab badges go to title slot, actions go to header right side
      if (this.titleSlotEl) {
        this.titleSlotEl.appendChild(this.tabBarContainerEl);
      }
      if (this.headerActionsEl) {
        this.headerActionsEl.appendChild(this.headerActionsContent);
        this.headerActionsEl.style.display = 'flex';
      }
    } else {
      // Input mode: Both go to active tab's navRowEl via the wrapper
      const activeTab = this.tabManager?.getActiveTab();
      if (activeTab && this.navRowContent) {
        // Re-assemble the nav row content wrapper
        this.navRowContent.appendChild(this.tabBarContainerEl);
        this.navRowContent.appendChild(this.headerActionsContent);
        activeTab.dom.navRowEl.appendChild(this.navRowContent);
      }
      // Hide header actions slot when in input mode
      if (this.headerActionsEl) {
        this.headerActionsEl.style.display = 'none';
      }
    }
  }

  /**
   * Updates layout when tabBarPosition setting changes.
   * Called from settings when user changes the tab bar position.
   */
  updateLayoutForPosition(): void {
    if (!this.viewContainerEl) return;

    const isHeaderMode = this.plugin.settings.tabBarPosition === 'header';

    // Update container class for CSS styling
    this.viewContainerEl.toggleClass('claudian-container--header-mode', isHeaderMode);

    // Move nav content to appropriate location
    this.updateNavRowLocation();

    // Update tab bar and title visibility
    this.updateTabBarVisibility();
  }

  // ============================================
  // Session Saving
  // ============================================

  /**
   * Opens the save modal to save the entire conversation (both user and assistant messages).
   */
  private async saveSessionToNote(): Promise<void> {
    const activeTab = this.tabManager?.getActiveTab();
    if (!activeTab) return;

    const messages = activeTab.state.messages;
    if (messages.length === 0) {
      new Notice(t('chat.renderer.noMessages' as any));
      return;
    }

    const markdown = this.formatSessionToMarkdown(messages);

    const now = new Date();
    const yyyy = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const formattedTime = `${yyyy}${MM}${dd}-${hh}${mm}${ss}`;
    const fallbackFilename = `conversation-${formattedTime}.md`;

    // Prefer the existing conversation title (auto-generated on first send and
    // visible in history) — only fall back to an LLM call when no title exists
    let conversationTitle: string | null = null;
    const conversationId = activeTab.state.currentConversationId;
    if (conversationId) {
      try {
        const conv = await this.plugin.getConversationById(conversationId);
        conversationTitle = conv?.title?.trim() || null;
      } catch {
        // Best-effort — fall through to generation
      }
    }

    const saveModal = new SaveNoteModal(
      this.app,
      conversationTitle
        ? `${conversationTitle.replace(/[\\/:"*?<>|]/g, '').replace(/\s+/g, '-')}.md`
        : t('chat.renderer.generatingTitle' as any),
      markdown,
      async (filename, folderPath) => {
        try {
          const fullPath = folderPath === '/' ? filename : `${folderPath}/${filename}`;
          const file = await this.app.vault.create(fullPath, markdown);
          const leaf = this.app.workspace.getLeaf(true);
          await leaf.openFile(file);

          new Notice(t('chat.renderer.saved' as any));
        } catch (err) {
          new Notice(`Failed to save conversation: ${err instanceof Error ? err.message : 'Unknown error'}`);
          throw err;
        }
      },
      !conversationTitle
    );
    saveModal.open();

    if (conversationTitle) return; // prefilled — no LLM request needed

    // Generate a title using the LLM
    try {
      const titleService = new TitleGenerationService(this.plugin);
      const tempId = `save-session-${Date.now()}`;
      const prompt = (t('chat.renderer.generateSessionFilenamePrompt' as any, { text: markdown.substring(0, 2000) })) ||
                     `Provide a very short, concise filename in English (without extension, max 10 chars) for this conversation between user and AI assistant:\n\n${markdown.substring(0, 2000)}`;

      await titleService.generateTitle(
        tempId,
        prompt,
        async (_id: string, result: { success: boolean; title?: string }) => {
          if (result.success && result.title) {
            const cleanTitle = result.title.replace(/[\\/:"*?<>|]/g, '').replace(/\s+/g, '-');
            saveModal.updateFilename(`${cleanTitle}.md`);
          } else {
            saveModal.setGenerationFailed(fallbackFilename);
          }
        }
      );
    } catch {
      saveModal.setGenerationFailed(fallbackFilename);
    }
  }

  /**
   * Formats all messages in the conversation into a single markdown document.
   */
  private formatSessionToMarkdown(messages: ChatMessage[]): string {
    const lines: string[] = [];

    for (const msg of messages) {
      // Skip internal messages
      if (msg.isInterrupt || msg.isRebuiltContext) continue;

      if (msg.role === 'user') {
        const content = msg.displayContent ?? msg.content;
        if (content) {
          lines.push(`## ${t('chat.role.user' as any)}`);
          lines.push('');
          lines.push(content);
          lines.push('');
        }

        // List attached files
        if (msg.attachedFiles && msg.attachedFiles.length > 0) {
          lines.push(`**${t('chat.renderer.attachedFiles' as any)}:**`);
          for (const file of msg.attachedFiles) {
            lines.push(`- \`${file}\``);
          }
          lines.push('');
        }
      } else if (msg.role === 'assistant') {
        const textContent = this.extractAssistantText(msg);
        if (textContent) {
          lines.push(`## ${t('chat.role.assistant' as any)}`);
          lines.push('');
          lines.push(textContent);
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Extracts text content blocks from an assistant message, skipping tool calls and thinking blocks.
   */
  private extractAssistantText(msg: ChatMessage): string {
    if (msg.contentBlocks && msg.contentBlocks.length > 0) {
      const textBlocks = msg.contentBlocks
        .filter((b): b is { type: 'text'; content: string } => b.type === 'text')
        .map(b => b.content)
        .filter(c => c && c.trim());
      if (textBlocks.length > 0) {
        return textBlocks.join('\n\n');
      }
    }
    return msg.content || '';
  }

  // ============================================
  // Tab Management
  // ============================================

  private handleTabClick(tabId: TabId): void {
    this.tabManager?.switchToTab(tabId);
  }

  private async handleTabClose(tabId: TabId): Promise<void> {
    const tab = this.tabManager?.getTab(tabId);
    // If streaming, treat close like user interrupt (force close cancels the stream)
    const force = tab?.state.isStreaming ?? false;
    await this.tabManager?.closeTab(tabId, force);
    this.updateTabBarVisibility();
  }

  private async handleNewTab(): Promise<void> {
    const tab = await this.tabManager?.createTab();
    if (!tab) {
      const maxTabs = this.plugin.settings.maxTabs ?? 3;
      new Notice(`Maximum ${maxTabs} tabs allowed`);
      return;
    }
    this.updateTabBarVisibility();
  }

  private updateTabBar(): void {
    if (!this.tabManager || !this.tabBar) return;

    // Debounce tab bar updates using requestAnimationFrame
    if (this.pendingTabBarUpdate !== null) {
      cancelAnimationFrame(this.pendingTabBarUpdate);
    }

    this.pendingTabBarUpdate = requestAnimationFrame(() => {
      this.pendingTabBarUpdate = null;
      if (!this.tabManager || !this.tabBar) return;

      const items = this.tabManager.getTabBarItems();
      this.tabBar.update(items);
      this.updateTabBarVisibility();
    });
  }

  private updateTabBarVisibility(): void {
    if (!this.tabBarContainerEl || !this.tabManager) return;

    const tabCount = this.tabManager.getTabCount();
    const showTabBar = tabCount >= 2;
    const isHeaderMode = this.plugin.settings.tabBarPosition === 'header';

    // Hide tab badges when only 1 tab, show when 2+
    this.tabBarContainerEl.style.display = showTabBar ? 'flex' : 'none';

    // In header mode, badges replace logo/title in the same location
    // In input mode, keep logo/title visible (badges are in nav row)
    const hideBranding = showTabBar && isHeaderMode;
    if (this.logoEl) {
      this.logoEl.style.display = hideBranding ? 'none' : '';
    }
    if (this.titleTextEl) {
      this.titleTextEl.style.display = hideBranding ? 'none' : '';
    }
  }

  // ============================================
  // History Dropdown
  // ============================================

  private toggleHistoryDropdown(): void {
    if (!this.historyDropdown) return;

    const isVisible = this.historyDropdown.hasClass('visible');
    if (isVisible) {
      this.historyDropdown.removeClass('visible');
    } else {
      this.updateHistoryDropdown();
      this.historyDropdown.addClass('visible');
    }
  }

  private updateHistoryDropdown(): void {
    if (!this.historyDropdown) return;
    this.historyDropdown.empty();

    const activeTab = this.tabManager?.getActiveTab();
    const conversationController = activeTab?.controllers.conversationController;

    if (conversationController) {
      conversationController.renderHistoryDropdown(this.historyDropdown, {
        onSelectConversation: async (conversationId) => {
          // Check if conversation is already open in this view's tabs
          const existingTab = this.findTabWithConversation(conversationId);
          if (existingTab) {
            // Switch to existing tab instead of opening in current tab
            await this.tabManager?.switchToTab(existingTab.id);
            this.historyDropdown?.removeClass('visible');
            return;
          }

          // Check if conversation is open in another view (split workspace scenario)
          const crossViewResult = this.plugin.findConversationAcrossViews(conversationId);
          if (crossViewResult && crossViewResult.view !== this) {
            // Focus the other view's leaf and switch to the tab
            this.plugin.app.workspace.revealLeaf(crossViewResult.view.leaf);
            await crossViewResult.view.getTabManager()?.switchToTab(crossViewResult.tabId);
            this.historyDropdown?.removeClass('visible');
            return;
          }

          // Open in current tab
          await this.tabManager?.openConversation(conversationId);
          this.historyDropdown?.removeClass('visible');
        },
      });
    }
  }

  private findTabWithConversation(conversationId: string): TabData | null {
    const tabs = this.tabManager?.getAllTabs() ?? [];
    return tabs.find(tab => tab.conversationId === conversationId) ?? null;
  }

  // ============================================
  // Event Wiring
  // ============================================

  private wireEventHandlers(): void {
    // Document-level click to close dropdowns
    this.registerDomEvent(document, 'click', () => {
      this.historyDropdown?.removeClass('visible');
    });

    // View-level Shift+Tab to toggle plan mode (works from any focused element)
    this.registerDomEvent(this.containerEl, 'keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab' && e.shiftKey && !e.isComposing) {
        e.preventDefault();
        const activeTab = this.tabManager?.getActiveTab();
        if (!activeTab) return;
        const current = this.plugin.settings.permissionMode;
        if (current === 'plan') {
          const restoreMode = activeTab.state.prePlanPermissionMode ?? 'normal';
          activeTab.state.prePlanPermissionMode = null;
          updatePlanModeUI(activeTab, this.plugin, restoreMode);
        } else {
          activeTab.state.prePlanPermissionMode = current;
          updatePlanModeUI(activeTab, this.plugin, 'plan');
        }
      }
    });

    // Register Escape on the view's Obsidian Scope to prevent Obsidian from
    // navigating away when Claudian is open as a main-area tab.
    // Returning false consumes the event (preventDefault + stops scope propagation).
    this.scope = new Scope(this.app.scope);
    this.scope.register([], 'Escape', () => {
      const activeTab = this.tabManager?.getActiveTab();
      if (activeTab?.state.isStreaming) {
        activeTab.controllers.inputController?.cancelStreaming();
      }
      return false;
    });

    // Vault events - forward to active tab's file context manager
    const markCacheDirty = (includesFolders: boolean): void => {
      const mgr = this.tabManager?.getActiveTab()?.ui.fileContextManager;
      if (!mgr) return;
      mgr.markFileCacheDirty();
      if (includesFolders) mgr.markFolderCacheDirty();
    };
    this.eventRefs.push(
      this.plugin.app.vault.on('create', () => markCacheDirty(true)),
      this.plugin.app.vault.on('delete', () => markCacheDirty(true)),
      this.plugin.app.vault.on('rename', () => markCacheDirty(true)),
      this.plugin.app.vault.on('modify', () => markCacheDirty(false))
    );

    // File open event
    this.registerEvent(
      this.plugin.app.workspace.on('file-open', (file) => {
        if (file) {
          this.tabManager?.getActiveTab()?.ui.fileContextManager?.handleFileOpen(file);
        }
      })
    );

    // Click outside to close mention dropdown
    this.registerDomEvent(document, 'click', (e) => {
      const activeTab = this.tabManager?.getActiveTab();
      if (activeTab) {
        const fcm = activeTab.ui.fileContextManager;
        if (fcm && !fcm.containsElement(e.target as Node) && e.target !== activeTab.dom.inputEl) {
          fcm.hideMentionDropdown();
        }
      }
    });
  }

  // ============================================
  // Persistence
  // ============================================

  private async restoreOrCreateTabs(): Promise<void> {
    if (!this.tabManager) return;

    // Try to restore from persisted state
    const persistedState = await this.plugin.storage.getTabManagerState();
    if (persistedState && persistedState.openTabs.length > 0) {
      await this.tabManager.restoreState(persistedState);
      await this.plugin.storage.clearLegacyActiveConversationId();
      return;
    }

    // No persisted state - migrate legacy activeConversationId if present
    const legacyActiveId = await this.plugin.storage.getLegacyActiveConversationId();
    if (legacyActiveId) {
      const conversation = await this.plugin.getConversationById(legacyActiveId);
      if (conversation) {
        await this.tabManager.createTab(conversation.id);
      } else {
        await this.tabManager.createTab();
      }
      await this.plugin.storage.clearLegacyActiveConversationId();
      return;
    }

    // Fallback: create a new empty tab
    await this.tabManager.createTab();
    await this.plugin.storage.clearLegacyActiveConversationId();
  }

  private persistTabState(): void {
    // Debounce persistence to avoid rapid writes (300ms delay)
    if (this.pendingPersist !== null) {
      clearTimeout(this.pendingPersist);
    }
    this.pendingPersist = setTimeout(() => {
      this.pendingPersist = null;
      if (!this.tabManager) return;
      const state = this.tabManager.getPersistedState();
      this.plugin.storage.setTabManagerState(state).catch(() => {
        // Silently ignore persistence errors
      });
    }, 300);
  }

  /** Force immediate persistence (for onClose/onunload). */
  private async persistTabStateImmediate(): Promise<void> {
    // Cancel any pending debounced persist
    if (this.pendingPersist !== null) {
      clearTimeout(this.pendingPersist);
      this.pendingPersist = null;
    }
    if (!this.tabManager) return;
    const state = this.tabManager.getPersistedState();
    await this.plugin.storage.setTabManagerState(state);
  }

  // ============================================
  // Public API
  // ============================================

  /** Gets the currently active tab. */
  getActiveTab(): TabData | null {
    return this.tabManager?.getActiveTab() ?? null;
  }

  /** Gets the tab manager. */
  getTabManager(): TabManager | null {
    return this.tabManager;
  }
}
