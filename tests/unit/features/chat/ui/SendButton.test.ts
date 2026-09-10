import { createMockEl } from '@test/helpers/mockElement';

import { SendButton } from '@/features/chat/ui/InputToolbar';

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  setIcon: jest.fn(),
}));

function createCallbacks(overrides: Record<string, any> = {}) {
  return {
    onSend: jest.fn(),
    onCancel: jest.fn(),
    getIsStreaming: jest.fn().mockReturnValue(false),
    canSend: jest.fn().mockReturnValue(true),
    ...overrides,
  };
}

describe('SendButton', () => {
  let parentEl: any;
  let callbacks: ReturnType<typeof createCallbacks>;
  let btn: SendButton;

  beforeEach(() => {
    jest.clearAllMocks();
    parentEl = createMockEl();
    callbacks = createCallbacks();
    btn = new SendButton(parentEl, callbacks as any);
  });

  it('should render a circular send button with send icon', () => {
    const btnEl = parentEl.querySelector('.claudian-send-btn');
    expect(btnEl).not.toBeNull();
    expect(btnEl?.innerHTML).toContain('svg');
  });

  it('should call onSend when clicked while not streaming', () => {
    const btnEl = parentEl.querySelector('.claudian-send-btn');
    btnEl?.dispatchEvent('click', { stopPropagation: () => {} });
    expect(callbacks.onSend).toHaveBeenCalledTimes(1);
    expect(callbacks.onCancel).not.toHaveBeenCalled();
  });

  it('should switch to stop state and call onCancel while streaming', () => {
    callbacks.getIsStreaming.mockReturnValue(true);
    btn.update();

    const btnEl = parentEl.querySelector('.claudian-send-btn');
    expect(btnEl?.hasClass('claudian-send-btn--stop')).toBe(true);

    btnEl?.dispatchEvent('click', { stopPropagation: () => {} });
    expect(callbacks.onCancel).toHaveBeenCalledTimes(1);
    expect(callbacks.onSend).not.toHaveBeenCalled();
  });

  it('should add disabled class when nothing to send', () => {
    callbacks.canSend.mockReturnValue(false);
    btn.update();

    const btnEl = parentEl.querySelector('.claudian-send-btn');
    expect(btnEl?.hasClass('disabled')).toBe(true);
  });

  it('should not add disabled class while streaming', () => {
    callbacks.canSend.mockReturnValue(false);
    callbacks.getIsStreaming.mockReturnValue(true);
    btn.update();

    const btnEl = parentEl.querySelector('.claudian-send-btn');
    expect(btnEl?.hasClass('disabled')).toBe(false);
  });
});
