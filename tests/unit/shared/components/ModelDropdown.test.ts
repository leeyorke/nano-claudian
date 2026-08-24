import { createMockEl } from '@test/helpers/mockElement';

import { ModelDropdown } from '@/shared/components/ModelDropdown';

function createDropdown(model = 'sonnet', envVars = '') {
  const containerEl = createMockEl();
  const inputEl = createMockEl('textarea');
  const callbacks = {
    onSelect: jest.fn(),
    onHide: jest.fn(),
    getSettings: jest.fn().mockReturnValue({
      model,
      enableOpus1M: false,
      enableSonnet1M: false,
    }),
    getEnvironmentVariables: jest.fn().mockReturnValue(envVars),
  };
  const dropdown = new ModelDropdown(containerEl, inputEl, callbacks as any);
  return { containerEl, inputEl, callbacks, dropdown };
}

async function typeCommand(inputEl: any, text: string) {
  inputEl.value = text;
  inputEl.selectionStart = text.length;
  inputEl.dispatchEvent('input');
  // showDropdown() awaits model resolution before rendering - flush microtasks
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('ModelDropdown', () => {
  it('should list full model names for the /model command', async () => {
    const { containerEl, inputEl } = createDropdown();

    await typeCommand(inputEl, '/model');

    const dropdownEl = containerEl.querySelector('.claudian-slash-dropdown');
    expect(dropdownEl).not.toBeNull();
    const names = dropdownEl!.children
      .filter((item: any) => !item.hasClass('claudian-model-header'))
      .map((item: any) => item.querySelector('.claudian-slash-name')?.textContent);
    expect(names).toEqual(['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6']);
  });

  it('should keep the friendly description as hint', async () => {
    const { containerEl, inputEl } = createDropdown();

    await typeCommand(inputEl, '/model');

    const dropdownEl = containerEl.querySelector('.claudian-slash-dropdown');
    const opusItem = dropdownEl!.children.find(
      (item: any) => item.querySelector('.claudian-slash-name')?.textContent === 'claude-opus-4-6'
    );
    expect(opusItem).toBeDefined();
    expect(opusItem!.querySelector('.claudian-slash-hint')?.textContent).toBe('Most capable');
  });

  it('should match search text against the full model name', async () => {
    const { containerEl, inputEl } = createDropdown();

    await typeCommand(inputEl, '/model claude');

    const dropdownEl = containerEl.querySelector('.claudian-slash-dropdown');
    expect(dropdownEl).not.toBeNull();
    const names = dropdownEl!.children
      .filter((item: any) => !item.hasClass('claudian-model-header'))
      .map((item: any) => item.querySelector('.claudian-slash-name')?.textContent);
    // Neither label nor alias value contains "claude", only the full name does
    expect(names.length).toBe(3);
  });

  it('should show custom environment models unchanged', async () => {
    const { containerEl, inputEl } = createDropdown('my-proxy-model', 'ANTHROPIC_MODEL=my-proxy-model');

    await typeCommand(inputEl, '/model');

    const dropdownEl = containerEl.querySelector('.claudian-slash-dropdown');
    const names = dropdownEl!.children
      .filter((item: any) => !item.hasClass('claudian-model-header'))
      .map((item: any) => item.querySelector('.claudian-slash-name')?.textContent);
    expect(names).toContain('my-proxy-model');
  });

  it('should mark the env-mapped custom model as selected for the current alias', async () => {
    // settings.model keeps the alias ('opus'), but env remaps that tier
    const { containerEl, inputEl } = createDropdown(
      'opus',
      'ANTHROPIC_DEFAULT_OPUS_MODEL=nvidia/nemotron-3-ultra:free'
    );

    await typeCommand(inputEl, '/model');

    const dropdownEl = containerEl.querySelector('.claudian-slash-dropdown');
    const checkedItem = dropdownEl!.children.find(
      (item: any) => item.querySelector('.claudian-slash-check')?.textContent === '✓'
    );
    expect(checkedItem?.querySelector('.claudian-slash-name')?.textContent).toBe('nvidia/nemotron-3-ultra:free');
  });
});
