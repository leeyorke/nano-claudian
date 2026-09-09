import { createMockEl } from '@test/helpers/mockElement';

import type { UsageInfo } from '@/core/types';
import {
  ContextUsageMeter,
  createInputToolbar,
  McpServerSelector,
  ModelCommandButton,
  PermissionToggle,
  SlashCommandButton,
  ThinkingBudgetSelector,
} from '@/features/chat/ui/InputToolbar';

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  setIcon: jest.fn(),
}));

function makeUsage(overrides: Partial<UsageInfo> = {}): UsageInfo {
  return {
    inputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    contextWindow: 200000,
    contextTokens: 0,
    percentage: 0,
    ...overrides,
  };
}

function createMockCallbacks(overrides: Record<string, any> = {}) {
  return {
    onModelChange: jest.fn().mockResolvedValue(undefined),
    onThinkingBudgetChange: jest.fn().mockResolvedValue(undefined),
    onEffortLevelChange: jest.fn().mockResolvedValue(undefined),
    onPermissionModeChange: jest.fn().mockResolvedValue(undefined),
    getSettings: jest.fn().mockReturnValue({
      model: 'sonnet',
      thinkingBudget: 'low',
      effortLevel: 'high',
      permissionMode: 'normal',
      enableOpus1M: false,
      enableSonnet1M: false,
    }),
    getEnvironmentVariables: jest.fn().mockReturnValue(''),
    onInsertCommand: jest.fn(),
    ...overrides,
  };
}

describe('ModelCommandButton', () => {
  let parentEl: any;
  let callbacks: ReturnType<typeof createMockCallbacks>;
  let btn: ModelCommandButton;

  beforeEach(() => {
    jest.clearAllMocks();
    parentEl = createMockEl();
    callbacks = createMockCallbacks();
    btn = new ModelCommandButton(parentEl, callbacks);
  });

  it('should create a container with model-selector class', () => {
    const container = parentEl.querySelector('.claudian-model-selector');
    expect(container).not.toBeNull();
  });

  it('should display current model full name', () => {
    const label = parentEl.querySelector('.claudian-model-label');
    expect(label?.textContent).toBe('claude-sonnet-4-6');
  });

  it('should show friendly label as button tooltip', () => {
    expect(parentEl.querySelector('.claudian-model-btn')?.getAttribute('title')).toContain('Sonnet');
  });

  it('should display first model when current model not found', () => {
    callbacks.getSettings.mockReturnValue({
      model: 'nonexistent',
      thinkingBudget: 'low',
      permissionMode: 'normal',
      enableOpus1M: false,
      enableSonnet1M: false,
    });
    btn.updateDisplay();
    const label = parentEl.querySelector('.claudian-model-label');
    expect(label?.textContent).toBe('claude-haiku-4-5');
  });

  it('should render model options in reverse order with full names', () => {
    btn.showDropdown();
    const dropdown = parentEl.querySelector('.claudian-model-dropdown');
    const options = dropdown?.children || [];
    expect(options.length).toBe(3);
    expect(options[0]?.children[0]?.textContent).toBe('claude-opus-4-6');
    expect(options[1]?.children[0]?.textContent).toBe('claude-sonnet-4-6');
    expect(options[2]?.children[0]?.textContent).toBe('claude-haiku-4-5');
  });

  it('should show tier label alongside model name', () => {
    callbacks.getEnvironmentVariables.mockReturnValue(
      'ANTHROPIC_DEFAULT_OPUS_MODEL=my-opus\n' +
      'ANTHROPIC_DEFAULT_FABLE_MODEL=my-fable'
    );
    callbacks.getSettings.mockReturnValue({
      model: 'my-opus',
      thinkingBudget: 'low',
      permissionMode: 'normal',
      enableOpus1M: false,
      enableSonnet1M: false,
    });
    btn.updateDisplay();
    btn.showDropdown();
    const dropdown = parentEl.querySelector('.claudian-model-dropdown');
    const options = dropdown?.children || [];
    const tierSpans = options.map((o: any) => o.querySelector('.claudian-model-tier')?.textContent);
    expect(tierSpans).toContain('Custom Opus model');
    expect(tierSpans).toContain('Custom Fable model');
  });

  it('should mark current model as selected', () => {
    btn.showDropdown();
    const dropdown = parentEl.querySelector('.claudian-model-dropdown');
    const options = dropdown?.children || [];
    const sonnetOption = options.find((o: any) => o.children[0]?.textContent === 'claude-sonnet-4-6');
    expect(sonnetOption?.hasClass('selected')).toBe(true);
  });

  it('should keep option tooltip with friendly label and description', () => {
    btn.showDropdown();
    const dropdown = parentEl.querySelector('.claudian-model-dropdown');
    const options = dropdown?.children || [];
    const opusOption = options.find((o: any) => o.children[0]?.textContent === 'claude-opus-4-6');
    expect(opusOption?.getAttribute('title')).toContain('Opus');
  });

  it('should call onModelChange when option clicked', async () => {
    btn.showDropdown();
    const dropdown = parentEl.querySelector('.claudian-model-dropdown');
    const options = dropdown?.children || [];
    const opusOption = options.find((o: any) => o.children[0]?.textContent === 'claude-opus-4-6');

    await opusOption?.dispatchEvent('click', { stopPropagation: () => {} });
    expect(callbacks.onModelChange).toHaveBeenCalledWith('opus');
  });

  it('should toggle dropdown on button click', () => {
    expect(btn.isVisible()).toBe(false);
    btn.showDropdown();
    expect(btn.isVisible()).toBe(true);
    btn.hideDropdown();
    expect(btn.isVisible()).toBe(false);
  });

  it('should use per-tier custom models from environment variables', () => {
    callbacks.getEnvironmentVariables.mockReturnValue(
      'ANTHROPIC_MODEL=default-model\n' +
      'ANTHROPIC_DEFAULT_OPUS_MODEL=my-opus\n' +
      'ANTHROPIC_DEFAULT_SONNET_MODEL=my-sonnet\n' +
      'ANTHROPIC_DEFAULT_HAIKU_MODEL=my-haiku'
    );
    callbacks.getSettings.mockReturnValue({
      model: 'default-model',
      thinkingBudget: 'low',
      permissionMode: 'normal',
      enableOpus1M: false,
      enableSonnet1M: false,
    });
    btn.updateDisplay();
    btn.showDropdown();
    const label = parentEl.querySelector('.claudian-model-label');
    expect(label?.textContent).toBe('default-model');
    const dropdown = parentEl.querySelector('.claudian-model-dropdown');
    const options = dropdown?.children || [];
    expect(options.length).toBe(4);
  });

  it('should not deduplicate when all env tiers map to same model value', () => {
    callbacks.getEnvironmentVariables.mockReturnValue(
      'ANTHROPIC_MODEL=shared-model\n' +
      'ANTHROPIC_DEFAULT_OPUS_MODEL=shared-model\n' +
      'ANTHROPIC_DEFAULT_SONNET_MODEL=shared-model\n' +
      'ANTHROPIC_DEFAULT_HAIKU_MODEL=shared-model'
    );
    callbacks.getSettings.mockReturnValue({
      model: 'shared-model',
      thinkingBudget: 'low',
      permissionMode: 'normal',
      enableOpus1M: false,
      enableSonnet1M: false,
    });
    btn.updateDisplay();
    btn.showDropdown();
    const dropdown = parentEl.querySelector('.claudian-model-dropdown');
    const options = dropdown?.children || [];
    expect(options.length).toBe(4);
  });

  it('should select only the option matching the current alias when tiers share same value', () => {
    callbacks.getEnvironmentVariables.mockReturnValue(
      'ANTHROPIC_DEFAULT_OPUS_MODEL=shared-model\n' +
      'ANTHROPIC_DEFAULT_SONNET_MODEL=shared-model\n' +
      'ANTHROPIC_DEFAULT_HAIKU_MODEL=shared-model'
    );
    callbacks.getSettings.mockReturnValue({
      model: 'sonnet',  // alias → should select only the Sonnet tier entry
      thinkingBudget: 'low',
      permissionMode: 'normal',
      enableOpus1M: false,
      enableSonnet1M: false,
    });
    btn.updateDisplay();
    btn.showDropdown();
    const dropdown = parentEl.querySelector('.claudian-model-dropdown');
    const options = dropdown?.children || [];
    const selected = options.filter((o: any) => o.hasClass('selected'));
    expect(selected.length).toBe(1);
    expect(selected[0]?.children[0]?.textContent).toBe('shared-model');
  });

  it('should not filter custom env models when 1M toggles are enabled', () => {
    callbacks.getEnvironmentVariables.mockReturnValue(
      'ANTHROPIC_MODEL=opus\n' +
      'ANTHROPIC_DEFAULT_OPUS_MODEL=custom-opus'
    );
    callbacks.getSettings.mockReturnValue({
      model: 'opus',
      thinkingBudget: 'low',
      permissionMode: 'normal',
      enableOpus1M: true,
      enableSonnet1M: true,
    });

    btn.updateDisplay();
    btn.showDropdown();
    const dropdown = parentEl.querySelector('.claudian-model-dropdown');
    const options = dropdown?.children || [];
    // Per-tier entries should not be filtered by 1M settings
    const customOpus = options.find((o: any) => o.children[0]?.textContent === 'custom-opus');
    expect(customOpus).toBeDefined();
  });

  it('should resolve the current alias to its env-mapped custom model', () => {
    callbacks.getEnvironmentVariables.mockReturnValue(
      'ANTHROPIC_DEFAULT_OPUS_MODEL=nvidia/nemotron-3-ultra:free'
    );
    callbacks.getSettings.mockReturnValue({
      model: 'opus',
      thinkingBudget: 'low',
      permissionMode: 'normal',
      enableOpus1M: false,
      enableSonnet1M: false,
    });
    btn.updateDisplay();
    btn.showDropdown();

    const label = parentEl.querySelector('.claudian-model-label');
    expect(label?.textContent).toBe('nvidia/nemotron-3-ultra:free');

    const dropdown = parentEl.querySelector('.claudian-model-dropdown');
    const selected = dropdown?.children.find((o: any) => o.hasClass('selected'));
    expect(selected?.children[0]?.textContent).toBe('nvidia/nemotron-3-ultra:free');
  });

  it('should show 1M variants instead of standard variants when enabled', () => {
    callbacks.getSettings.mockReturnValue({
      model: 'opus[1m]',
      thinkingBudget: 'medium',
      permissionMode: 'normal',
      enableOpus1M: true,
      enableSonnet1M: true,
    });

    btn.updateDisplay();
    btn.showDropdown();

    const dropdown = parentEl.querySelector('.claudian-model-dropdown');
    const options = dropdown?.children || [];
    expect(options.find((o: any) => o.children[0]?.textContent === 'claude-opus-4-6[1m]')).toBeDefined();
    expect(options.find((o: any) => o.children[0]?.textContent === 'claude-sonnet-4-6[1m]')).toBeDefined();
    expect(options.find((o: any) => o.children[0]?.textContent === 'claude-opus-4-6')).toBeUndefined();
    expect(options.find((o: any) => o.children[0]?.textContent === 'claude-sonnet-4-6')).toBeUndefined();
    expect(parentEl.querySelector('.claudian-model-label')?.textContent).toBe('claude-opus-4-6[1m]');
  });

  it('should add open class when dropdown is shown', () => {
    btn.showDropdown();
    expect(parentEl.querySelector('.claudian-model-selector')?.hasClass('open')).toBe(true);
    expect(parentEl.querySelector('.claudian-model-btn')?.hasClass('open')).toBe(true);
  });

  it('should remove open class when dropdown is hidden', () => {
    btn.showDropdown();
    btn.hideDropdown();
    expect(parentEl.querySelector('.claudian-model-selector')?.hasClass('open')).toBe(false);
    expect(parentEl.querySelector('.claudian-model-btn')?.hasClass('open')).toBe(false);
  });
});

describe('ThinkingBudgetSelector', () => {
  let parentEl: any;
  let callbacks: ReturnType<typeof createMockCallbacks>;
  let selector: ThinkingBudgetSelector;

  describe('adaptive mode (Claude models)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      parentEl = createMockEl();
      callbacks = createMockCallbacks();
      selector = new ThinkingBudgetSelector(parentEl, callbacks);
    });

    it('should create a container with thinking-selector class', () => {
      const container = parentEl.querySelector('.claudian-thinking-selector');
      expect(container).not.toBeNull();
    });

    it('should show effort selector for Claude models', () => {
      const effort = parentEl.querySelector('.claudian-thinking-effort');
      expect(effort).not.toBeNull();
      expect(effort?.style?.display).not.toBe('none');
    });

    it('should hide budget selector for Claude models', () => {
      const budget = parentEl.querySelector('.claudian-thinking-budget');
      expect(budget?.style?.display).toBe('none');
    });

    it('should display current effort level for Claude models', () => {
      const current = parentEl.querySelector('.claudian-thinking-current');
      expect(current?.textContent).toBe('High');
    });
  });

  describe('legacy mode (custom models)', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      parentEl = createMockEl();
      callbacks = createMockCallbacks({
        getSettings: jest.fn().mockReturnValue({
          model: 'custom-model',
          thinkingBudget: 'low',
          effortLevel: 'high',
          permissionMode: 'normal',
          enableOpus1M: false,
          enableSonnet1M: false,
        }),
      });
      selector = new ThinkingBudgetSelector(parentEl, callbacks);
    });

    it('should hide effort selector for custom models', () => {
      const effort = parentEl.querySelector('.claudian-thinking-effort');
      expect(effort?.style?.display).toBe('none');
    });

    it('should show budget selector for custom models', () => {
      const budget = parentEl.querySelector('.claudian-thinking-budget');
      expect(budget?.style?.display).not.toBe('none');
    });

    it('should display current budget label', () => {
      const current = parentEl.querySelector('.claudian-thinking-current');
      expect(current?.textContent).toBe('Low');
    });

    it('should display Off when budget is off', () => {
      callbacks.getSettings.mockReturnValue({
        model: 'custom-model',
        thinkingBudget: 'off',
        permissionMode: 'normal',
        enableOpus1M: false,
        enableSonnet1M: false,
      });
      selector.updateDisplay();
      const current = parentEl.querySelector('.claudian-thinking-current');
      expect(current?.textContent).toBe('Off');
    });

    it('should render budget options in reverse order', () => {
      const options = parentEl.querySelector('.claudian-thinking-options');
      expect(options).not.toBeNull();
      // THINKING_BUDGETS reversed: [xhigh, high, medium, low, off]
      const gears = options?.children || [];
      expect(gears.length).toBe(5);
      expect(gears[0]?.textContent).toBe('Ultra');
      expect(gears[4]?.textContent).toBe('Off');
    });

    it('should mark current budget as selected', () => {
      const options = parentEl.querySelector('.claudian-thinking-options');
      const gears = options?.children || [];
      const lowGear = gears.find((g: any) => g.textContent === 'Low');
      expect(lowGear?.hasClass('selected')).toBe(true);
    });

    it('should call onThinkingBudgetChange when gear clicked', async () => {
      const options = parentEl.querySelector('.claudian-thinking-options');
      const gears = options?.children || [];
      const highGear = gears.find((g: any) => g.textContent === 'High');

      await highGear?.dispatchEvent('click', { stopPropagation: () => {} });
      expect(callbacks.onThinkingBudgetChange).toHaveBeenCalledWith('high');
    });

    it('should set title with token count for non-off budgets', () => {
      const options = parentEl.querySelector('.claudian-thinking-options');
      const gears = options?.children || [];
      const highGear = gears.find((g: any) => g.textContent === 'High');
      expect(highGear?.getAttribute('title')).toContain('16,000 tokens');
    });

    it('should set title as Disabled for off budget', () => {
      const options = parentEl.querySelector('.claudian-thinking-options');
      const gears = options?.children || [];
      const offGear = gears.find((g: any) => g.textContent === 'Off');
      expect(offGear?.getAttribute('title')).toBe('Disabled');
    });
  });
});

describe('PermissionToggle', () => {
  let parentEl: any;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    jest.clearAllMocks();
    parentEl = createMockEl();
    callbacks = createMockCallbacks();
    new PermissionToggle(parentEl, callbacks);
  });

  it('should create a container with permission-toggle class', () => {
    const container = parentEl.querySelector('.claudian-permission-toggle');
    expect(container).not.toBeNull();
  });

  it('should display Safe label when in normal mode', () => {
    const label = parentEl.querySelector('.claudian-permission-label');
    expect(label?.textContent).toBe('Safe');
  });

  it('should display YOLO label when in yolo mode', () => {
    callbacks.getSettings.mockReturnValue({
      model: 'sonnet',
      thinkingBudget: 'low',
      permissionMode: 'yolo',
      enableOpus1M: false,
      enableSonnet1M: false,
    });
    const parentEl2 = createMockEl();
    new PermissionToggle(parentEl2, callbacks);

    const label = parentEl2.querySelector('.claudian-permission-label');
    expect(label?.textContent).toBe('YOLO');
  });

  it('should show PLAN label and hide toggle in plan mode', () => {
    callbacks.getSettings.mockReturnValue({
      model: 'sonnet',
      thinkingBudget: 'low',
      permissionMode: 'plan',
      enableOpus1M: false,
      enableSonnet1M: false,
    });
    const parentEl2 = createMockEl();
    new PermissionToggle(parentEl2, callbacks);

    const label = parentEl2.querySelector('.claudian-permission-label');
    expect(label?.textContent).toBe('PLAN');
    expect(label?.hasClass('plan-active')).toBe(true);

    const toggle = parentEl2.querySelector('.claudian-toggle-switch');
    expect(toggle?.style.display).toBe('none');
  });

  it('should add active class when in yolo mode', () => {
    callbacks.getSettings.mockReturnValue({
      model: 'sonnet',
      thinkingBudget: 'low',
      permissionMode: 'yolo',
    });
    const parentEl2 = createMockEl();
    new PermissionToggle(parentEl2, callbacks);

    const toggle = parentEl2.querySelector('.claudian-toggle-switch');
    expect(toggle?.hasClass('active')).toBe(true);
  });

  it('should not have active class in normal mode', () => {
    const toggle = parentEl.querySelector('.claudian-toggle-switch');
    expect(toggle?.hasClass('active')).toBe(false);
  });

  it('should toggle from normal to yolo on click', async () => {
    const toggle = parentEl.querySelector('.claudian-toggle-switch');
    await toggle?.dispatchEvent('click');
    expect(callbacks.onPermissionModeChange).toHaveBeenCalledWith('yolo');
  });

  it('should toggle from yolo to normal on click', async () => {
    callbacks.getSettings.mockReturnValue({
      model: 'sonnet',
      thinkingBudget: 'low',
      permissionMode: 'yolo',
    });
    const parentEl2 = createMockEl();
    new PermissionToggle(parentEl2, callbacks);

    const toggle = parentEl2.querySelector('.claudian-toggle-switch');
    await toggle?.dispatchEvent('click');
    expect(callbacks.onPermissionModeChange).toHaveBeenCalledWith('normal');
  });
});

describe('McpServerSelector', () => {
  let parentEl: any;
  let selector: McpServerSelector;

  function createMockMcpManager(servers: { name: string; enabled: boolean; contextSaving?: boolean }[] = []) {
    return {
      getServers: jest.fn().mockReturnValue(
        servers.map(s => ({
          name: s.name,
          enabled: s.enabled,
          contextSaving: s.contextSaving ?? false,
        }))
      ),
    } as any;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    parentEl = createMockEl();
    selector = new McpServerSelector(parentEl);
  });

  it('should create container with mcp-selector class', () => {
    const container = parentEl.querySelector('.claudian-mcp-selector');
    expect(container).not.toBeNull();
  });

  it('should return empty set of enabled servers initially', () => {
    expect(selector.getEnabledServers().size).toBe(0);
  });

  it('should hide container when no servers configured', () => {
    selector.setMcpManager(createMockMcpManager([]));
    const container = parentEl.querySelector('.claudian-mcp-selector');
    expect(container?.style.display).toBe('none');
  });

  it('should show container when servers are configured', () => {
    selector.setMcpManager(createMockMcpManager([{ name: 'test', enabled: true }]));
    const container = parentEl.querySelector('.claudian-mcp-selector');
    expect(container?.style.display).toBe('');
  });

  it('should show empty message when all servers are disabled', () => {
    selector.setMcpManager(createMockMcpManager([{ name: 'test', enabled: false }]));
    const empty = parentEl.querySelector('.claudian-mcp-selector-empty');
    expect(empty?.textContent).toBe('All MCP servers disabled');
  });

  it('should show no servers message when no servers configured', () => {
    selector.setMcpManager(createMockMcpManager([]));
    const empty = parentEl.querySelector('.claudian-mcp-selector-empty');
    expect(empty?.textContent).toBe('No MCP servers configured');
  });

  it('should add mentioned servers', () => {
    selector.setMcpManager(createMockMcpManager([{ name: 'server1', enabled: true }]));
    selector.addMentionedServers(new Set(['server1']));
    expect(selector.getEnabledServers().has('server1')).toBe(true);
  });

  it('should not re-render when adding already enabled servers', () => {
    selector.setMcpManager(createMockMcpManager([{ name: 'server1', enabled: true }]));
    selector.addMentionedServers(new Set(['server1']));
    const enabledBefore = selector.getEnabledServers();

    selector.addMentionedServers(new Set(['server1']));
    expect(selector.getEnabledServers()).toEqual(enabledBefore);
  });

  it('should clear all enabled servers', () => {
    selector.setMcpManager(createMockMcpManager([
      { name: 'server1', enabled: true },
      { name: 'server2', enabled: true },
    ]));
    selector.addMentionedServers(new Set(['server1', 'server2']));
    expect(selector.getEnabledServers().size).toBe(2);

    selector.clearEnabled();
    expect(selector.getEnabledServers().size).toBe(0);
  });

  it('should set enabled servers from array', () => {
    selector.setMcpManager(createMockMcpManager([
      { name: 'server1', enabled: true },
      { name: 'server2', enabled: true },
    ]));
    selector.setEnabledServers(['server1', 'server2']);
    expect(selector.getEnabledServers().size).toBe(2);
  });

  it('should prune enabled servers that no longer exist in manager', () => {
    selector.setMcpManager(createMockMcpManager([
      { name: 'server1', enabled: true },
      { name: 'server2', enabled: true },
    ]));
    selector.setEnabledServers(['server1', 'server2']);

    // Now update manager to only have server1
    selector.setMcpManager(createMockMcpManager([{ name: 'server1', enabled: true }]));
    expect(selector.getEnabledServers().has('server1')).toBe(true);
    expect(selector.getEnabledServers().has('server2')).toBe(false);
  });

  it('should invoke onChange callback when pruning removes servers', () => {
    const onChange = jest.fn();
    selector.setOnChange(onChange);

    selector.setMcpManager(createMockMcpManager([
      { name: 'server1', enabled: true },
      { name: 'server2', enabled: true },
    ]));
    selector.setEnabledServers(['server1', 'server2']);
    onChange.mockClear();

    // Prune by removing server2
    selector.setMcpManager(createMockMcpManager([{ name: 'server1', enabled: true }]));
    expect(onChange).toHaveBeenCalled();
  });

  it('should show badge when more than 1 server enabled', () => {
    selector.setMcpManager(createMockMcpManager([
      { name: 'server1', enabled: true },
      { name: 'server2', enabled: true },
    ]));
    selector.setEnabledServers(['server1', 'server2']);
    selector.updateDisplay();

    const badge = parentEl.querySelector('.claudian-mcp-selector-badge');
    expect(badge?.hasClass('visible')).toBe(true);
    expect(badge?.textContent).toBe('2');
  });

  it('should not show badge when only 1 server enabled', () => {
    selector.setMcpManager(createMockMcpManager([{ name: 'server1', enabled: true }]));
    selector.setEnabledServers(['server1']);
    selector.updateDisplay();

    const badge = parentEl.querySelector('.claudian-mcp-selector-badge');
    expect(badge?.hasClass('visible')).toBe(false);
  });

  it('should add active class to icon when servers are enabled', () => {
    selector.setMcpManager(createMockMcpManager([{ name: 'server1', enabled: true }]));
    selector.setEnabledServers(['server1']);
    selector.updateDisplay();

    const icon = parentEl.querySelector('.claudian-mcp-selector-icon');
    expect(icon?.hasClass('active')).toBe(true);
  });

  it('should remove active class from icon when no servers enabled', () => {
    selector.setMcpManager(createMockMcpManager([{ name: 'server1', enabled: true }]));
    selector.clearEnabled();
    selector.updateDisplay();

    const icon = parentEl.querySelector('.claudian-mcp-selector-icon');
    expect(icon?.hasClass('active')).toBe(false);
  });

  it('should handle null mcpManager', () => {
    selector.setMcpManager(null);
    expect(selector.getEnabledServers().size).toBe(0);
  });
});

describe('ContextUsageMeter', () => {
  let parentEl: any;
  let meter: ContextUsageMeter;

  beforeEach(() => {
    jest.clearAllMocks();
    parentEl = createMockEl();
    meter = new ContextUsageMeter(parentEl);
  });

  it('should create a container with context-meter class', () => {
    const container = parentEl.querySelector('.claudian-context-meter');
    expect(container).not.toBeNull();
  });

  it('should be hidden initially', () => {
    const container = parentEl.querySelector('.claudian-context-meter');
    expect(container?.style.display).toBe('none');
  });

  it('should remain hidden when update called with null', () => {
    meter.update(null);
    const container = parentEl.querySelector('.claudian-context-meter');
    expect(container?.style.display).toBe('none');
  });

  it('should remain hidden when contextTokens is 0', () => {
    meter.update(makeUsage({ contextTokens: 0, contextWindow: 200000, percentage: 0 }));
    const container = parentEl.querySelector('.claudian-context-meter');
    expect(container?.style.display).toBe('none');
  });

  it('should become visible when contextTokens > 0', () => {
    meter.update(makeUsage({ contextTokens: 50000, contextWindow: 200000, percentage: 25 }));
    const container = parentEl.querySelector('.claudian-context-meter');
    expect(container?.style.display).toBe('flex');
  });

  it('should display percentage', () => {
    meter.update(makeUsage({ contextTokens: 50000, contextWindow: 200000, percentage: 25 }));
    const percent = parentEl.querySelector('.claudian-context-meter-percent');
    expect(percent?.textContent).toBe('25%');
  });

  it('should add warning class when usage > 80%', () => {
    meter.update(makeUsage({ contextTokens: 170000, contextWindow: 200000, percentage: 85 }));
    const container = parentEl.querySelector('.claudian-context-meter');
    expect(container?.hasClass('warning')).toBe(true);
  });

  it('should remove warning class when usage drops below 80%', () => {
    meter.update(makeUsage({ contextTokens: 170000, contextWindow: 200000, percentage: 85 }));
    meter.update(makeUsage({ contextTokens: 50000, contextWindow: 200000, percentage: 25 }));
    const container = parentEl.querySelector('.claudian-context-meter');
    expect(container?.hasClass('warning')).toBe(false);
  });

  it('should set tooltip with formatted token counts', () => {
    meter.update(makeUsage({ contextTokens: 50000, contextWindow: 200000, percentage: 25 }));
    const container = parentEl.querySelector('.claudian-context-meter');
    expect(container?.getAttribute('data-tooltip')).toBe('50k / 200k');
  });

  it('should format small token counts without k suffix', () => {
    meter.update(makeUsage({ contextTokens: 500, contextWindow: 200000, percentage: 0 }));
    const container = parentEl.querySelector('.claudian-context-meter');
    expect(container?.getAttribute('data-tooltip')).toBe('500 / 200k');
  });

  it('should add compact reminder to tooltip when usage > 80%', () => {
    meter.update(makeUsage({ contextTokens: 170000, contextWindow: 200000, percentage: 85 }));
    const container = parentEl.querySelector('.claudian-context-meter');
    expect(container?.getAttribute('data-tooltip')).toBe('170k / 200k (Approaching limit, run `/compact` to continue)');
  });

  it('should not add compact reminder to tooltip when usage ≤ 80%', () => {
    meter.update(makeUsage({ contextTokens: 160000, contextWindow: 200000, percentage: 80 }));
    const container = parentEl.querySelector('.claudian-context-meter');
    expect(container?.getAttribute('data-tooltip')).toBe('160k / 200k');
  });
});

describe('McpServerSelector - toggle and badges', () => {
  let parentEl: any;
  let selector: McpServerSelector;

  function createMockMcpManager(servers: { name: string; enabled: boolean; contextSaving?: boolean }[] = []) {
    return {
      getServers: jest.fn().mockReturnValue(
        servers.map(s => ({
          name: s.name,
          enabled: s.enabled,
          contextSaving: s.contextSaving ?? false,
        }))
      ),
    } as any;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    parentEl = createMockEl();
    selector = new McpServerSelector(parentEl);
  });

  it('should render context-saving badge for servers with contextSaving', () => {
    selector.setMcpManager(createMockMcpManager([
      { name: 'server1', enabled: true, contextSaving: true },
    ]));

    const csBadge = parentEl.querySelector('.claudian-mcp-selector-cs-badge');
    expect(csBadge).not.toBeNull();
    expect(csBadge?.textContent).toBe('@');
  });

  it('should not render context-saving badge for servers without contextSaving', () => {
    selector.setMcpManager(createMockMcpManager([
      { name: 'server1', enabled: true, contextSaving: false },
    ]));

    const csBadge = parentEl.querySelector('.claudian-mcp-selector-cs-badge');
    expect(csBadge).toBeNull();
  });

  it('should toggle server on mousedown and update display', () => {
    const onChange = jest.fn();
    selector.setOnChange(onChange);

    selector.setMcpManager(createMockMcpManager([
      { name: 'server1', enabled: true },
    ]));

    // Find the server item and trigger mousedown
    const item = parentEl.querySelector('.claudian-mcp-selector-item');
    expect(item).not.toBeNull();

    // Simulate mousedown to enable
    const mousedownHandlers = item._eventListeners?.get('mousedown');
    expect(mousedownHandlers).toBeDefined();
    mousedownHandlers![0]({ preventDefault: jest.fn(), stopPropagation: jest.fn() });

    expect(selector.getEnabledServers().has('server1')).toBe(true);
    expect(onChange).toHaveBeenCalled();

    // Toggle again to disable
    onChange.mockClear();
    mousedownHandlers![0]({ preventDefault: jest.fn(), stopPropagation: jest.fn() });

    expect(selector.getEnabledServers().has('server1')).toBe(false);
    expect(onChange).toHaveBeenCalled();
  });

  it('should re-render dropdown on mouseenter', () => {
    selector.setMcpManager(createMockMcpManager([
      { name: 'server1', enabled: true },
    ]));

    // Get container and trigger mouseenter
    const container = parentEl.querySelector('.claudian-mcp-selector');
    const mouseenterHandlers = container?._eventListeners?.get('mouseenter');
    expect(mouseenterHandlers).toBeDefined();

    // Should not throw
    expect(() => mouseenterHandlers![0]()).not.toThrow();
  });
});

describe('createInputToolbar', () => {
  it('should return all toolbar components', () => {
    const parentEl = createMockEl();
    const callbacks = createMockCallbacks();
    const toolbar = createInputToolbar(parentEl, callbacks);

    expect(toolbar.modelCommandBtn).toBeInstanceOf(ModelCommandButton);
    expect(toolbar.thinkingBudgetSelector).toBeInstanceOf(ThinkingBudgetSelector);
    expect(toolbar.contextUsageMeter).toBeInstanceOf(ContextUsageMeter);
    expect(toolbar.mcpServerSelector).toBeInstanceOf(McpServerSelector);
    expect(toolbar.permissionToggle).toBeInstanceOf(PermissionToggle);
    expect(toolbar.skillCommandBtn).toBeInstanceOf(SlashCommandButton);
  });
});
