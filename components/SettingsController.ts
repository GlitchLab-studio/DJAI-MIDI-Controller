/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import type { LiveMusicGenerationConfig } from '../types';

/** A panel for managing real-time music generation settings. */
@customElement('settings-controller')
export class SettingsController extends LitElement {
  static override styles = css`
    :host {
      display: block;
      padding: 2vmin;
      background-color: rgba(30, 30, 30, 0.85); /* Slightly more opaque for readability */
      backdrop-filter: blur(5px);
      color: #eee;
      box-sizing: border-box;
      border-radius: 8px; /* Consistent rounded corners */
      font-family: 'Google Sans', sans-serif;
      font-size: 1.5vmin;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: #666 #1a1a1a;
      margin: 0 auto; /* Centering and spacing, remove top/bottom margin to be controlled by wrapper */
      max-width: 900px; /* Max width for larger screens */
      width: 100%; 
      transition: max-height 0.3s ease-out; /* For advanced toggle */
    }
    :host([showadvanced]) {
      /* max-height is controlled by .advanced-settings.visible below */
    }
    :host::-webkit-scrollbar {
      width: 6px;
    }
    :host::-webkit-scrollbar-track {
      background: #1a1a1a;
      border-radius: 3px;
    }
    :host::-webkit-scrollbar-thumb {
      background-color: #666;
      border-radius: 3px;
    }
    .setting {
      margin-bottom: 1vmin; /* Increased spacing */
      display: flex;
      flex-direction: column;
      gap: 0.5vmin;
    }
    label {
      font-weight: bold;
      display: flex;
      justify-content: space-between;
      align-items: center;
      white-space: nowrap;
      user-select: none;
    }
    label span:last-child {
      font-weight: normal;
      color: #ccc;
      min-width: 3em;
      text-align: right;
    }
    input[type='range'] {
      --track-height: 8px;
      --track-bg: #0009;
      --track-border-radius: 4px;
      --thumb-size: 16px;
      --thumb-bg: var(--theme-color-cyan, #00FFFF); /* Themed thumb */
      --thumb-border-radius: 50%;
      --thumb-box-shadow: 0 0 3px rgba(0, 0, 0, 0.7);
      --value-percent: 0%;
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: var(--track-height);
      background: transparent;
      cursor: pointer;
      margin: 0.5vmin 0;
      border: none;
      padding: 0;
      vertical-align: middle;
    }
    input[type='range']::-webkit-slider-runnable-track {
      width: 100%;
      height: var(--track-height);
      cursor: pointer;
      border: none;
      background: linear-gradient(
        to right,
        var(--thumb-bg) var(--value-percent),
        var(--track-bg) var(--value-percent)
      );
      border-radius: var(--track-border-radius);
    }
    input[type='range']::-moz-range-track {
      width: 100%;
      height: var(--track-height);
      cursor: pointer;
      background: var(--track-bg); /* Fallback for FF if gradient not working */
      border-radius: var(--track-border-radius);
      border: none;
    }
     input[type='range']::-moz-range-progress { /* For Firefox track fill */
      background-color: var(--thumb-bg);
      height: var(--track-height);
      border-radius: var(--track-border-radius);
    }
    input[type='range']::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      height: var(--thumb-size);
      width: var(--thumb-size);
      background: var(--thumb-bg);
      border-radius: var(--thumb-border-radius);
      box-shadow: var(--thumb-box-shadow);
      cursor: pointer;
      margin-top: calc((var(--thumb-size) - var(--track-height)) / -2);
    }
    input[type='range']::-moz-range-thumb {
      height: var(--thumb-size);
      width: var(--thumb-size);
      background: var(--thumb-bg);
      border-radius: var(--thumb-border-radius);
      box-shadow: var(--thumb-box-shadow);
      cursor: pointer;
      border: none;
    }
    input[type='number'],
    input[type='text'],
    select {
      background-color: #2a2a2a;
      color: #eee;
      border: 1px solid #666;
      border-radius: 3px;
      padding: 0.6vmin; /* Slightly more padding */
      font-size: 1.5vmin;
      font-family: inherit;
      box-sizing: border-box;
    }
    input[type='number'] {
      width: 7em; /* Wider for BPM */
    }
    input[type='text'] {
      width: 100%;
    }
    input[type='text']::placeholder {
      color: #888;
    }
    input[type='number']:focus,
    input[type='text']:focus,
    select:focus {
      outline: none;
      border-color: var(--theme-color-cyan, #00FFFF); /* Themed focus */
      box-shadow: 0 0 0 2px var(--theme-color-cyan, #00FFFF)4D; /* Themed focus shadow */
    }
    select {
      width: 100%;
    }
    select option {
      background-color: #2a2a2a;
      color: #eee;
    }
    .checkbox-setting {
      display: flex; /* Align items in a row */
      flex-direction: row;
      align-items: center;
      gap: 1vmin;
    }
    input[type='checkbox'] {
      cursor: pointer;
      accent-color: var(--theme-color-magenta, #FF00FF); /* Themed checkbox */
      width: 1.8vmin;
      height: 1.8vmin;
    }
    .core-settings-row {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap;
      gap: 3vmin; /* Spacing between core settings */
      margin-bottom: 2vmin;
      justify-content: space-around; /* Distribute items */
    }
    .core-settings-row .setting {
      min-width: 18vmin; /* Ensure items have enough space */
      flex-basis: 200px; /* Base width before growing/shrinking */
      flex-grow: 1;
    }
    .core-settings-row label span:last-child {
      min-width: 2.5em;
    }
    .advanced-toggle {
      cursor: pointer;
      margin: 2vmin 0 1vmin 0;
      color: #aaa;
      text-decoration: underline;
      user-select: none;
      font-size: 1.4vmin;
      width: fit-content;
    }
    .advanced-toggle:hover {
      color: #eee;
    }
    .advanced-settings {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(18vmin, 1fr));
      gap: 2vmin 3vmin; /* row-gap column-gap */
      overflow: hidden;
      max-height: 0;
      opacity: 0;
      transition:
        max-height 0.4s ease-out, /* Smoother transition */
        opacity 0.4s ease-out,
        margin-top 0.4s ease-out; /* Transition margin */
       margin-top: 0;
    }
    .advanced-settings.visible {
      max-height: 60vmin; /* Increased max-height for more content */
      opacity: 1;
      margin-top: 2vmin; /* Add margin when visible */
    }
    hr.divider {
      border: none;
      border-top: 1px solid #666;
      margin: 2vmin 0;
      width: 100%;
    }
    .auto-row {
      display: flex;
      align-items: center;
      gap: 0.5vmin;
    }
    .setting[auto='true'] input[type='range'] {
      pointer-events: none;
      filter: grayscale(80%) opacity(0.7); /* Softer disabled look */
    }
     .setting[auto='true'] label span:last-child {
      color: #888; /* Dim value display when auto */
    }
    .auto-row span { /* Value display in auto row */
      color: #ccc;
      min-width: 3em;
      text-align: right;
    }
    .auto-row label { /* "Auto" label */
      font-weight: normal;
      cursor: pointer;
      margin-left: 0.5vmin;
    }
    .checkbox-group {
      display: flex;
      flex-direction: column;
      gap: 1vmin; /* Space between checkboxes in a group */
    }
  `;

  private readonly defaultConfig: LiveMusicGenerationConfig = {
    temperature: 1.0, 
    topK: 40,
    guidance: 3.0,
  };

  @state() public config: LiveMusicGenerationConfig = { ...this.defaultConfig };
  @state() showAdvanced = false;
  @state() autoDensity = true;
  @state() lastDefinedDensity: number | undefined = 0.5; 
  @state() autoBrightness = true;
  @state() lastDefinedBrightness: number | undefined = 0.5; 

  public resetToDefaults() {
    this.config = { ...this.defaultConfig };
    this.autoDensity = true;
    this.lastDefinedDensity = 0.5;
    this.config.density = undefined; 

    this.autoBrightness = true;
    this.lastDefinedBrightness = 0.5;
    this.config.brightness = undefined; 

    this.showAdvanced = false; 
    this.dispatchSettingsChange();
    this.requestUpdate(); 
  }

  private updateSliderBackground(inputEl: HTMLInputElement) {
    if (inputEl.type !== 'range') return;
    const min = Number(inputEl.min) || 0;
    const max = Number(inputEl.max) || 100;
    const value = Number(inputEl.value);
    const percentage = ((value - min) / (max - min)) * 100;
    inputEl.style.setProperty('--value-percent', `${percentage}%`);
  }

  private handleInputChange(e: Event) {
    const target = e.target as HTMLInputElement | HTMLSelectElement;
    const key = target.id as keyof LiveMusicGenerationConfig | 'auto-density' | 'auto-brightness';
    let value: string | number | boolean | undefined;

    if (target instanceof HTMLInputElement) {
        if (target.type === 'number' || target.type === 'range') {
          value = target.value === '' ? undefined : Number(target.value);
          if (target.type === 'range') {
            this.updateSliderBackground(target);
          }
        } else if (target.type === 'checkbox') {
          value = target.checked;
        } else { 
          value = target.value === '' ? undefined : target.value;
        }
    } else { 
         if (target.options[target.selectedIndex]?.disabled || target.value === "SCALE_UNSPECIFIED" || target.value === "") {
             value = undefined;
         } else {
             value = target.value;
         }
    }

    const newConfig = { ...this.config };

    if (key === 'auto-density') {
      this.autoDensity = Boolean(value);
      newConfig.density = this.autoDensity ? undefined : this.lastDefinedDensity;
    } else if (key === 'auto-brightness') {
      this.autoBrightness = Boolean(value);
      newConfig.brightness = this.autoBrightness ? undefined : this.lastDefinedBrightness;
    } else {
      // The key is a direct key of LiveMusicGenerationConfig here.
      // Cast value to 'any' to satisfy TypeScript, as the runtime logic
      // (matching input type to config property type via element ID) ensures correctness.
      newConfig[key as keyof LiveMusicGenerationConfig] = value as any;
    }

    if (newConfig.density !== undefined) {
      this.lastDefinedDensity = newConfig.density;
    }
    if (newConfig.brightness !== undefined) {
      this.lastDefinedBrightness = newConfig.brightness;
    }

    this.config = newConfig;
    this.dispatchSettingsChange();
  }

  override firstUpdated() {
    this.shadowRoot
        ?.querySelectorAll<HTMLInputElement>('input[type="range"]')
        .forEach((slider: HTMLInputElement) => {
          this.updateSliderBackground(slider);
        });
  }

  override updated(changedProperties: Map<string | symbol, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('config') || changedProperties.has('autoDensity') || changedProperties.has('autoBrightness')) {
      this.shadowRoot
        ?.querySelectorAll<HTMLInputElement>('input[type="range"]')
        .forEach((slider: HTMLInputElement) => {
          const configKey = slider.id as keyof LiveMusicGenerationConfig;
          let sliderValue: number | string | undefined;

          if (slider.id === 'density') {
            sliderValue = this.autoDensity ? (this.lastDefinedDensity ?? 0.5) : this.config.density;
            slider.value = String(sliderValue ?? 0.5);

          } else if (slider.id === 'brightness') {
             sliderValue = this.autoBrightness ? (this.lastDefinedBrightness ?? 0.5) : this.config.brightness;
             slider.value = String(sliderValue ?? 0.5);
          } else {
            sliderValue = this.config[configKey];
            if (typeof sliderValue === 'number') {
                slider.value = String(sliderValue);
            } else if (sliderValue === undefined && (slider.id === 'temperature' || slider.id === 'guidance' || slider.id === 'topK')) {
                slider.value = String((this.defaultConfig as any)[configKey] ?? slider.defaultValue);
            }
          }
          this.updateSliderBackground(slider);
        });
    }
  }

  private dispatchSettingsChange() {
    this.dispatchEvent(
      new CustomEvent<LiveMusicGenerationConfig>('settings-changed', {
        detail: this.config,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private toggleAdvancedSettings() {
    this.showAdvanced = !this.showAdvanced;
    if (this.showAdvanced) {
        this.setAttribute('showadvanced', '');
    } else {
        this.removeAttribute('showadvanced');
    }
  }

  render() {
    const cfg = this.config;
    const advancedClasses = classMap({
      'advanced-settings': true,
      'visible': this.showAdvanced,
    });
    const scaleMap = new Map<string, string>([
      ['Auto', 'SCALE_UNSPECIFIED'],
      ['C Major / A Minor', 'C_MAJOR_A_MINOR'],
      ['C# / Db Major / A# / Bb Minor', 'D_FLAT_MAJOR_B_FLAT_MINOR'],
      ['D Major / B Minor', 'D_MAJOR_B_MINOR'],
      ['D# / Eb Major / C Minor', 'E_FLAT_MAJOR_C_MINOR'],
      ['E Major / C# / Db Minor', 'E_MAJOR_D_FLAT_MINOR'],
      ['F Major / D Minor', 'F_MAJOR_D_MINOR'],
      ['F# / Gb Major / D# / Eb Minor', 'G_FLAT_MAJOR_E_FLAT_MINOR'],
      ['G Major / E Minor', 'G_MAJOR_E_MINOR'],
      ['G# / Ab Major / F Minor', 'A_FLAT_MAJOR_F_MINOR'],
      ['A Major / F# / Gb Minor', 'A_MAJOR_G_FLAT_MINOR'],
      ['A# / Bb Major / G Minor', 'B_FLAT_MAJOR_G_MINOR'],
      ['B Major / G# / Ab Minor', 'B_MAJOR_A_FLAT_MINOR'],
    ]);

    return html`
      <div class="core-settings-row">
        <div class="setting">
          <label for="temperature">Temperature <span>${(cfg.temperature ?? this.defaultConfig.temperature!).toFixed(1)}</span></label>
          <input
            type="range"
            id="temperature"
            min="0"
            max="2" 
            step="0.1"
            .value=${String(cfg.temperature ?? this.defaultConfig.temperature!)}
            @input=${this.handleInputChange} />
        </div>
        <div class="setting">
          <label for="guidance">Guidance <span>${(cfg.guidance ?? this.defaultConfig.guidance!).toFixed(1)}</span></label>
          <input
            type="range"
            id="guidance"
            min="1" 
            max="10" 
            step="0.1"
            .value=${String(cfg.guidance ?? this.defaultConfig.guidance!)}
            @input=${this.handleInputChange} />
        </div>
        <div class="setting">
          <label for="topK">Top K <span>${cfg.topK ?? this.defaultConfig.topK!}</span></label>
          <input
            type="range"
            id="topK"
            min="1"
            max="100"
            step="1"
            .value=${String(cfg.topK ?? this.defaultConfig.topK!)}
            @input=${this.handleInputChange} />
        </div>
      </div>
      <hr class="divider" />
      <div class=${advancedClasses}>
        <div class="setting">
          <label for="seed">Seed</label>
          <input
            type="number"
            id="seed"
            .value=${cfg.seed ?? ''}
            @input=${this.handleInputChange}
            placeholder="Auto" />
        </div>
        <div class="setting">
          <label for="bpm">BPM Override</label> 
          <input
            type="number"
            id="bpm"
            min="60"
            max="240"
            .value=${cfg.bpm ?? ''}
            @input=${this.handleInputChange}
            placeholder="App Default" />
        </div>
        <div class="setting" auto=${this.autoDensity.toString()}>
          <label for="density">Density </label>
          <input
            type="range"
            id="density"
            min="0"
            max="1"
            step="0.05"
            .value=${String(this.autoDensity ? (this.lastDefinedDensity ?? 0.5) : (cfg.density ?? this.lastDefinedDensity ?? 0.5))}
            @input=${this.handleInputChange}
            ?disabled=${this.autoDensity}/>
          <div class="auto-row">
            <input
              type="checkbox"
              id="auto-density"
              .checked=${this.autoDensity}
              @change=${this.handleInputChange} />
            <label for="auto-density">Auto</label>
            <span>${(this.config.density ?? this.lastDefinedDensity ?? 0.5).toFixed(2)}</span>
          </div>
        </div>
        <div class="setting" auto=${this.autoBrightness.toString()}>
          <label for="brightness">Brightness</label>
          <input
            type="range"
            id="brightness"
            min="0"
            max="1"
            step="0.05"
            .value=${String(this.autoBrightness ? (this.lastDefinedBrightness ?? 0.5) : (cfg.brightness ?? this.lastDefinedBrightness ?? 0.5))}
            @input=${this.handleInputChange}
            ?disabled=${this.autoBrightness}/>
          <div class="auto-row">
            <input
              type="checkbox"
              id="auto-brightness"
              .checked=${this.autoBrightness}
              @change=${this.handleInputChange} />
            <label for="auto-brightness">Auto</label>
            <span>${(this.config.brightness ?? this.lastDefinedBrightness ?? 0.5).toFixed(2)}</span>
          </div>
        </div>
        <div class="setting">
          <label for="scale">Scale Override</label>
          <select
            id="scale"
            .value=${cfg.scale || 'SCALE_UNSPECIFIED'}
            @change=${this.handleInputChange}>
            ${[...scaleMap.entries()].map(
              ([displayName, enumValue]) =>
                html`<option value=${enumValue} ?selected=${cfg.scale === enumValue}>${displayName}</option>`,
            )}
          </select>
        </div>
        <div class="setting checkbox-group">
          <div class="checkbox-setting">
            <input
              type="checkbox"
              id="muteBass"
              .checked=${!!cfg.muteBass}
              @change=${this.handleInputChange} />
            <label for="muteBass" style="font-weight: normal;">Mute Bass</label>
          </div>
          <div class="checkbox-setting">
            <input
              type="checkbox"
              id="muteDrums"
              .checked=${!!cfg.muteDrums}
              @change=${this.handleInputChange} />
            <label for="muteDrums" style="font-weight: normal;">Mute Drums</label>
          </div>
          <div class="checkbox-setting">
            <input
              type="checkbox"
              id="onlyBassAndDrums"
              .checked=${!!cfg.onlyBassAndDrums}
              @change=${this.handleInputChange} />
            <label for="onlyBassAndDrums" style="font-weight: normal;">Only Bass & Drums</label>
          </div>
        </div>
      </div>
      <div class="advanced-toggle" @click=${this.toggleAdvancedSettings} role="button" tabindex="0"
           @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') this.toggleAdvancedSettings(); }}>
        ${this.showAdvanced ? 'Hide' : 'Show'} Advanced Settings
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'settings-controller': SettingsController;
  }
}