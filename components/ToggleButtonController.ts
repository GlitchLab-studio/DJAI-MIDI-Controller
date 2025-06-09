/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';
import type { Prompt } from '../types';

const ON_WEIGHT = 0.8; 
const OFF_WEIGHT = 0;

@customElement('toggle-button-controller')
export class ToggleButtonController extends LitElement {
  static override styles = css`
    :host {
      display: flex; 
      width: 100%;
      height: 100%; 
    }
    .toggle-button {
      font-family: 'Google Sans', sans-serif;
      font-weight: 500;
      width: 100%; 
      height: 100%; 
      box-sizing: border-box; 
      padding: 0.8vmin 1vmin;
      border: 2px solid var(--button-border-color, #555);
      border-radius: 8px;
      cursor: pointer;
      background-color: var(--button-bg-color, #333);
      color: var(--button-text-color, #fff);
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
      -webkit-font-smoothing: antialiased;
      user-select: none;
    }

    .toggle-button .inner-text {
      font-size: clamp(1.6vmin, 3.5vw, 2.4vmin); 
      line-height: 1.2; 
      width: 100%; 
      word-break: break-word; 
      
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
      outline: none; 
    }
    
    .toggle-button.filtered {
      /* Styles for filtered are now primarily driven by theme variables */
      cursor: not-allowed;
    }
    .toggle-button.filtered .inner-text {
      text-decoration: line-through; 
    }
    
    .toggle-button:hover:not(.on):not(.filtered) {
      border-color: var(--button-border-color-hover, #777);
      background-color: var(--button-bg-color-hover, #444);
    }
    .toggle-button:active:not(.on):not(.filtered) {
      background-color: var(--button-bg-color-active, #555);
    }
  `;

  @property({ type: String }) promptId = '';
  @property({ type: String }) text = '';
  @property({ type: Number }) weight = OFF_WEIGHT;
  @property({ type: String }) color = '#007bff'; 
  @property({ type: String }) categoryKey: string | null = null;
  @property({ type: String }) sourceType: 'knob' | 'button' = 'button';
  @property({ type: Boolean, reflect: true }) filtered = false;
  @property({ type: Number }) audioLevel = 0; 

  @state() private isOn = false;
  @state() private lastValidText: string = '';

  private computedStyle: CSSStyleDeclaration | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.isOn = this.weight === ON_WEIGHT;
    this.lastValidText = this.text;
    // Ensure computedStyle is available for the first render if needed.
    if (!this.computedStyle && this.shadowRoot) {
        this.computedStyle = getComputedStyle(this);
    }
  }
  
  override firstUpdated() {
    this.lastValidText = this.text;
    const innerTextElement = this.shadowRoot?.querySelector('.inner-text');
    if (innerTextElement) {
        innerTextElement.textContent = this.text;
    }
    // Get computedStyle after the component is fully connected and rendered
    if (!this.computedStyle) {
        this.computedStyle = getComputedStyle(this);
    }
  }


  override updated(changedProperties: Map<string | number | symbol, unknown>): void {
    if (changedProperties.has('weight')) {
      const newIsOn = this.weight === ON_WEIGHT;
      if (newIsOn !== this.isOn) {
        this.isOn = newIsOn;
      }
    }
    if (changedProperties.has('filtered') && this.filtered) {
        if (this.isOn) {
            this.isOn = false;
            this.weight = OFF_WEIGHT;
            this.dispatchPromptChange(); 
        }
    }
    if (changedProperties.has('text')) {
        this.lastValidText = this.text;
        const innerTextElement = this.shadowRoot?.querySelector('.inner-text');
        if (innerTextElement && innerTextElement.textContent !== this.text) {
            innerTextElement.textContent = this.text;
        }
    }
  }

  private isColorLight(hexColor: string): boolean {
    const color = hexColor.startsWith('#') ? hexColor.substring(1) : hexColor;
    if (color.length !== 6 && color.length !== 3) return false; 
    let r, g, b;
    if (color.length === 3) {
        r = parseInt(color[0] + color[0], 16);
        g = parseInt(color[1] + color[1], 16);
        b = parseInt(color[2] + color[2], 16);
    } else {
        r = parseInt(color.substring(0, 2), 16);
        g = parseInt(color.substring(2, 4), 16);
        b = parseInt(color.substring(4, 6), 16);
    }
    // Check for NaN in case parseInt failed
    if (isNaN(r) || isNaN(g) || isNaN(b)) return false; 
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
  }

  private adjustColor(hexColor: string, percent: number): string {
    if (!hexColor.startsWith('#')) return hexColor; // Return original if not a valid hex

    let R = parseInt(hexColor.substring(1,3),16);
    let G = parseInt(hexColor.substring(3,5),16);
    let B = parseInt(hexColor.substring(5,7),16);

    if (isNaN(R) || isNaN(G) || isNaN(B)) return hexColor; // Return original if parsing failed

    R = Math.round(R * (1 + percent));
    G = Math.round(G * (1 + percent));
    B = Math.round(B * (1 + percent));

    R = Math.max(0, Math.min(255, R));
    G = Math.max(0, Math.min(255, G));
    B = Math.max(0, Math.min(255, B));

    const RR = R.toString(16).padStart(2, '0');
    const GG = G.toString(16).padStart(2, '0');
    const BB = B.toString(16).padStart(2, '0');

    return `#${RR}${GG}${BB}`;
  }


  private handleMainButtonClick() {
    if (this.filtered) return; 

    this.isOn = !this.isOn;
    this.weight = this.isOn ? ON_WEIGHT : OFF_WEIGHT;
    this.dispatchPromptChange();
  }

  private dispatchPromptChange() {
    this.dispatchEvent(
      new CustomEvent<Prompt>('prompt-changed', {
        bubbles: true,
        composed: true,
        detail: {
          promptId: this.promptId,
          text: this.text,
          weight: this.weight,
          cc: -1, 
          color: this.color,
          categoryKey: this.categoryKey,
          sourceType: this.sourceType,
        },
      }),
    );
  }

  private onTextFocus(e: FocusEvent) {
    if (this.filtered) return;
    const target = e.target as HTMLElement;
    target.style.webkitLineClamp = 'unset'; 
    target.style.display = 'block'; 
    target.style.overflow = 'visible';
    
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(target);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  private onTextBlur(e: FocusEvent) {
    if (this.filtered) return;
    const target = e.target as HTMLElement;
    
    this._updateTextFromElement(target.textContent || '');
    
    target.style.webkitLineClamp = '2';
    target.style.display = '-webkit-box';
    target.style.overflow = 'hidden';
  }

  private onTextKeydown(e: KeyboardEvent) {
    if (this.filtered) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLElement).blur(); 
    }
  }
  
  private _updateTextFromElement(newTextContent: string) {
    const newText = newTextContent.trim();
    const innerTextElement = this.shadowRoot?.querySelector('.inner-text');

    if (!newText) {
      this.text = this.lastValidText;
      if (innerTextElement) innerTextElement.textContent = this.lastValidText;
    } else if (newText !== this.text) {
      this.text = newText;
      this.lastValidText = newText;
      this.dispatchPromptChange();
    }
    if (innerTextElement && innerTextElement.textContent !== this.text) {
         innerTextElement.textContent = this.text;
    }
  }

  override render() {
    if (!this.computedStyle && this.shadowRoot) { // Ensure computedStyle is available
        this.computedStyle = getComputedStyle(this);
    }
    const cs = this.computedStyle; // cs can be null if computedStyle wasn't ready

    const buttonClasses = {
      'toggle-button': true,
      'on': this.isOn && !this.filtered,
      'filtered': this.filtered,
    };
    
    let currentStyles: Record<string, string> = {
        '--button-bg-color': cs?.getPropertyValue('--button-small-bg-color').trim() || '#404040',
        '--button-text-color': cs?.getPropertyValue('--button-small-text-color').trim() || '#cccccc',
        '--button-border-color': cs?.getPropertyValue('--button-small-border-color').trim() || '#555555',
        '--button-bg-color-hover': cs?.getPropertyValue('--button-small-bg-color-hover').trim() || '#505050',
        '--button-border-color-hover': cs?.getPropertyValue('--button-small-border-color-hover').trim() || '#777777',
        '--button-bg-color-active': cs?.getPropertyValue('--button-small-bg-color-active').trim() || '#606060',
    };

    if (this.filtered) {
      currentStyles = {
        '--button-bg-color': cs?.getPropertyValue('--knob-filtered-bg-color').trim() || '#FF4500', 
        '--button-text-color': cs?.getPropertyValue('--knob-filtered-text-color').trim() || '#fff',   
        '--button-border-color': cs?.getPropertyValue('--knob-filtered-border-color').trim() || '#CC3700',
        '--button-bg-color-hover': cs?.getPropertyValue('--knob-filtered-bg-color-hover').trim() || cs?.getPropertyValue('--knob-filtered-bg-color').trim() || '#FF4500',
        '--button-border-color-hover': cs?.getPropertyValue('--knob-filtered-border-color-hover').trim() || cs?.getPropertyValue('--knob-filtered-border-color').trim() || '#CC3700',
        '--button-bg-color-active': cs?.getPropertyValue('--knob-filtered-bg-color').trim() || '#FF4500',
      };
    } else if (this.isOn) {
      let baseHexColor = '#CCCCCC'; // Default fallback if color parsing fails
      if (cs) { // Only proceed if computedStyle is available
          const varMatch = this.color.match(/var\((--[\w-]+)\s*,\s*(#[0-9a-fA-F]{3,6})\)/);
          if (varMatch) {
              const varName = varMatch[1];
              const fallbackColor = varMatch[2];
              const computedValue = cs.getPropertyValue(varName).trim();
              baseHexColor = computedValue || fallbackColor;
          } else if (this.color.startsWith('#')) {
              baseHexColor = this.color;
          } else {
              console.warn(`ToggleButtonController: Unexpected format for this.color: ${this.color}. Using fallback ${baseHexColor}.`);
          }
      } else if (this.color.startsWith('#')) { // Fallback if cs is not ready but color is direct hex
          baseHexColor = this.color;
      }


      let activeBgColor = baseHexColor; 
      const brightnessFactor = this.audioLevel * 0.20; 
      activeBgColor = this.adjustColor(baseHexColor, brightnessFactor);

      const activeBorderColor = this.adjustColor(activeBgColor, -0.15); 
      const activeTextColor = this.isColorLight(activeBgColor) ? 
        (cs?.getPropertyValue('--knob-on-text-color-light-bg').trim() || '#000000') : 
        (cs?.getPropertyValue('--knob-on-text-color').trim() || '#FFFFFF');
      
      currentStyles = {
        '--button-bg-color': activeBgColor, // This is now a direct hex color string
        '--button-text-color': activeTextColor,
        '--button-border-color': activeBorderColor,
        '--button-bg-color-hover': activeBgColor, 
        '--button-border-color-hover': activeBorderColor,
        '--button-bg-color-active': activeBgColor, 
      };
    }

    return html`
      <div
        class=${classMap(buttonClasses)}
        style=${styleMap(currentStyles)}
        @click=${this.handleMainButtonClick} 
        aria-pressed=${this.isOn && !this.filtered ? 'true' : 'false'}
        title=${this.filtered ? "This prompt has been filtered and cannot be used." : this.text}
        tabindex="0" 
      >
        <span 
          class="inner-text"
          contenteditable=${this.filtered ? 'false' : 'plaintext-only'}
          spellcheck="false"
          @focus=${this.onTextFocus}
          @blur=${this.onTextBlur}
          @keydown=${this.onTextKeydown}
          @click=${(e: Event) => { if (this.filtered) { e.stopPropagation(); e.preventDefault(); } }}
        >${this.text}</span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'toggle-button-controller': ToggleButtonController;
  }
}