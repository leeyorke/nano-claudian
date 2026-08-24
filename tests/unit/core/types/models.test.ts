import { DEFAULT_CLAUDE_MODELS, getModelFullName } from '@/core/types';

describe('models.ts', () => {
  describe('DEFAULT_CLAUDE_MODELS fullName', () => {
    it('should define a full model name for every default model', () => {
      for (const model of DEFAULT_CLAUDE_MODELS) {
        expect(model.fullName).toBeDefined();
        expect(model.fullName!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getModelFullName', () => {
    it('should resolve the haiku alias to the full model id', () => {
      expect(getModelFullName('haiku')).toBe('claude-haiku-4-5');
    });

    it('should resolve the sonnet alias to the full model id', () => {
      expect(getModelFullName('sonnet')).toBe('claude-sonnet-4-6');
    });

    it('should resolve the opus alias to the full model id', () => {
      expect(getModelFullName('opus')).toBe('claude-opus-4-6');
    });

    it('should resolve 1M variants with a [1m] suffix', () => {
      expect(getModelFullName('sonnet[1m]')).toBe('claude-sonnet-4-6[1m]');
      expect(getModelFullName('opus[1m]')).toBe('claude-opus-4-6[1m]');
    });

    it('should pass custom environment model ids through unchanged', () => {
      expect(getModelFullName('us.anthropic.claude-sonnet-4-20250514-v1:0')).toBe(
        'us.anthropic.claude-sonnet-4-20250514-v1:0'
      );
      expect(getModelFullName('custom-model')).toBe('custom-model');
    });
  });
});
