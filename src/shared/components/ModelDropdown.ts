import { DEFAULT_CLAUDE_MODELS, filterVisibleModelOptions, getModelFullName } from '../../core/types/models';
import { getModelOptionsFromEnvironment, parseEnvironmentVariables, resolveSelectedModelValue } from '../../utils/env';

export interface ModelDropdownCallbacks {
  onSelect: (modelValue: string) => void;
  onHide: () => void;
  getSettings: () => any;
  getEnvironmentVariables: () => string;
  getSdkModels?: () => Promise<{ value: string; label: string; description?: string }[]>;
}

export interface ModelDropdownOptions {
  fixed?: boolean;
}

export class ModelDropdown {
  private containerEl: HTMLElement;
  private dropdownEl: HTMLElement | null = null;
  private inputEl: HTMLTextAreaElement | HTMLInputElement;
  private callbacks: ModelDropdownCallbacks;
  private enabled = true;
  private onInput: () => void;
  private selectedIndex = 0;
  private filteredModels: { value: string; label: string; description?: string }[] = [];
  private isFixed: boolean;

  constructor(
    containerEl: HTMLElement,
    inputEl: HTMLTextAreaElement | HTMLInputElement,
    callbacks: ModelDropdownCallbacks,
    options: ModelDropdownOptions = {}
  ) {
    this.containerEl = containerEl;
    this.inputEl = inputEl;
    this.callbacks = callbacks;
    this.isFixed = options.fixed ?? false;

    this.onInput = () => this.handleInputChange();
    this.inputEl.addEventListener('input', this.onInput);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.hide();
    }
  }

  handleInputChange(): void {
    if (!this.enabled) return;

    const text = this.getInputValue();
    const cursorPos = this.getCursorPosition();
    const textBeforeCursor = text.substring(0, cursorPos);

    // Only show if exactly /model or starts with /model (with space)
    if (textBeforeCursor === '/model' || textBeforeCursor.startsWith('/model ')) {
      let search = '';
      if (textBeforeCursor.startsWith('/model ')) {
        search = textBeforeCursor.substring(textBeforeCursor.indexOf('/model') + 6).trim().toLowerCase();
      }
      this.showDropdown(search);
    } else {
      this.hide();
    }
  }

  handleKeydown(e: KeyboardEvent): boolean {
    if (!this.enabled || !this.isVisible()) return false;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.navigate(1);
        return true;
      case 'ArrowUp':
        e.preventDefault();
        this.navigate(-1);
        return true;
      case 'Enter':
      case 'Tab':
        if (this.filteredModels.length > 0) {
          e.preventDefault();
          this.selectItem();
          return true;
        }
        return false;
      case 'Escape':
        e.preventDefault();
        this.hide();
        return true;
    }
    return false;
  }

  isVisible(): boolean {
    return this.dropdownEl?.hasClass('visible') ?? false;
  }

  hide(): void {
    if (this.dropdownEl) {
      this.dropdownEl.removeClass('visible');
    }
    this.callbacks.onHide();
  }

  destroy(): void {
    this.inputEl.removeEventListener('input', this.onInput);
    if (this.dropdownEl) {
      this.dropdownEl.remove();
      this.dropdownEl = null;
    }
  }

  private getInputValue(): string {
    return this.inputEl.value;
  }

  private getCursorPosition(): number {
    return this.inputEl.selectionStart || 0;
  }

  private setInputValue(value: string): void {
    this.inputEl.value = value;
  }

  private setCursorPosition(pos: number): void {
    this.inputEl.selectionStart = pos;
    this.inputEl.selectionEnd = pos;
  }

  private async getAvailableModels(): Promise<{ value: string; label: string; description?: string }[]> {
    const envVars = parseEnvironmentVariables(this.callbacks.getEnvironmentVariables());
    const customModels = getModelOptionsFromEnvironment(envVars);

    if (customModels.length > 0) {
      // Per-tier env models — include SDK models as additional options
      const models = [...customModels];

      if (this.callbacks.getSdkModels) {
        const sdkModels = await this.callbacks.getSdkModels();
        const existingValues = new Set(models.map(m => m.value));
        for (const sdkModel of sdkModels) {
          if (!existingValues.has(sdkModel.value)) {
            models.push({ value: sdkModel.value, label: sdkModel.label, description: sdkModel.description ?? '' });
            existingValues.add(sdkModel.value);
          }
        }
      }

      // Don't filter per-tier entries by 1M settings — those are env-driven
      return models;
    }

    const models = [...DEFAULT_CLAUDE_MODELS];

    if (this.callbacks.getSdkModels) {
      const sdkModels = await this.callbacks.getSdkModels();
      const existingValues = new Set(models.map(m => m.value));
      for (const sdkModel of sdkModels) {
        if (!existingValues.has(sdkModel.value)) {
          models.push({ value: sdkModel.value, label: sdkModel.label, description: sdkModel.description ?? '' });
          existingValues.add(sdkModel.value);
        }
      }
    }

    const settings = this.callbacks.getSettings();
    return filterVisibleModelOptions(models, settings.enableOpus1M, settings.enableSonnet1M);
  }

  private async showDropdown(searchText: string): Promise<void> {
    const allModels = await this.getAvailableModels();
    
    this.filteredModels = allModels.filter(model => {
      const fullName = getModelFullName(model.value).toLowerCase();
      return model.label.toLowerCase().includes(searchText) ||
        model.value.toLowerCase().includes(searchText) ||
        fullName.includes(searchText);
    });

    if (this.filteredModels.length === 0) {
      this.hide();
      return;
    }

    this.selectedIndex = 0;
    this.render();
  }

  private render(): void {
    if (!this.dropdownEl) {
      this.dropdownEl = this.createDropdownElement();
    }

    this.dropdownEl.empty();
    
    // Header like Figure 2
    const headerEl = this.dropdownEl.createDiv({ 
      cls: 'claudian-slash-item claudian-model-header'
    });
    headerEl.setText('< /model');

    const currentModel = this.callbacks.getSettings().model;
    const envVars = parseEnvironmentVariables(this.callbacks.getEnvironmentVariables());

    for (let i = 0; i < this.filteredModels.length; i++) {
      const model = this.filteredModels[i];
      const itemEl = this.dropdownEl.createDiv({ cls: 'claudian-slash-item' });

      if (i === this.selectedIndex) {
        itemEl.addClass('selected');
      }

      const isSelected = resolveSelectedModelValue(
        this.filteredModels.map(m => m.value),
        currentModel,
        envVars
      ) === model.value;
      
      const checkEl = itemEl.createSpan({ cls: 'claudian-slash-check', attr: { style: 'display: inline-block; width: 16px; font-weight: bold; color: var(--text-normal);' } });
      checkEl.setText(isSelected ? '✓' : '');

      const nameEl = itemEl.createSpan({ cls: 'claudian-slash-name', attr: { style: 'font-weight: 500;' } });
      nameEl.setText(getModelFullName(model.value));

      if (model.description) {
        const hintEl = itemEl.createSpan({ cls: 'claudian-slash-hint' });
        hintEl.setText(model.description);
      }

      itemEl.addEventListener('click', () => {
        this.selectedIndex = i;
        this.selectItem();
      });

      itemEl.addEventListener('mouseenter', () => {
        this.selectedIndex = i;
        this.updateSelection();
      });
    }

    this.dropdownEl.addClass('visible');

    // Position for fixed mode (inline editor)
    if (this.isFixed) {
      this.positionFixed();
    }
  }

  private createDropdownElement(): HTMLElement {
    if (this.isFixed) {
      return this.containerEl.createDiv({
        cls: 'claudian-slash-dropdown claudian-slash-dropdown-fixed',
      });
    } else {
      return this.containerEl.createDiv({ cls: 'claudian-slash-dropdown' });
    }
  }

  private positionFixed(): void {
    if (!this.dropdownEl || !this.isFixed) return;

    const inputRect = this.inputEl.getBoundingClientRect();
    this.dropdownEl.style.position = 'fixed';
    this.dropdownEl.style.bottom = `${window.innerHeight - inputRect.top + 4}px`;
    this.dropdownEl.style.left = `${inputRect.left}px`;
    this.dropdownEl.style.right = 'auto';
    this.dropdownEl.style.width = `${Math.max(inputRect.width, 280)}px`;
    this.dropdownEl.style.zIndex = '10001';
  }

  private navigate(direction: number): void {
    const maxIndex = this.filteredModels.length - 1;
    this.selectedIndex = Math.max(0, Math.min(maxIndex, this.selectedIndex + direction));
    this.updateSelection();
  }

  private updateSelection(): void {
    const items = this.dropdownEl?.querySelectorAll('.claudian-slash-item:not(.claudian-model-header)');
    items?.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.addClass('selected');
        (item as HTMLElement).scrollIntoView({ block: 'nearest' });
      } else {
        item.removeClass('selected');
      }
    });
  }

  private selectItem(): void {
    if (this.filteredModels.length === 0) return;

    const selected = this.filteredModels[this.selectedIndex];
    if (!selected) return;

    const text = this.getInputValue();
    const cursorPos = this.getCursorPosition();
    
    // Remove the /model command text
    const textBeforeCursor = text.substring(0, cursorPos);
    const afterCursor = text.substring(cursorPos);
    
    const slashIndex = textBeforeCursor.lastIndexOf('/model');
    const beforeSlash = textBeforeCursor.substring(0, slashIndex);
    
    // Just clear the /model command, leaving the rest
    this.setInputValue(beforeSlash + afterCursor);
    this.setCursorPosition(beforeSlash.length);

    this.hide();
    this.callbacks.onSelect(selected.value);
    this.inputEl.focus();
  }
}
