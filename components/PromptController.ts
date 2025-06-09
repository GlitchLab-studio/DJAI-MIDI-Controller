/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { GoogleGenAI } from '@google/genai';

import type { WeightKnob } from './WeightKnob';
import type { MidiDispatcher } from '../utils/MidiDispatcher';
import type { Prompt, ControlChange } from '../types';

// Assume ai is initialized globally or passed in if needed for other models.
// For this component, we'll use a local instance for suggestions.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const SUGGESTION_MODEL = 'gemini-2.5-flash-preview-04-17';
const ON_WEIGHT_TOGGLE = 0.7; // Ensure consistency if this value changes in index.tsx

/** A single prompt input associated with a MIDI CC. */
@customElement('prompt-controller')
export class PromptController extends LitElement {
  static override styles = css`
    .prompt {
      width: 100%;
      height: 100%; 
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      overflow: visible; 
      position: relative; 
    }
    weight-knob {
      width: 70%; 
      max-width: 90px; 
      min-width: 40px; 
      flex-shrink: 0;
    }
    #midi {
      font-family: monospace;
      text-align: center;
      font-size: clamp(1.2vmin, 2.5vw, 1.8vmin); 
      border: 0.15vmin solid #fff; 
      border-radius: 0.5vmin;
      padding: 1px 4px; 
      color: #fff;
      background: #0006;
      cursor: pointer;
      visibility: hidden;
      user-select: none;
      margin-top: 0.5vmin; 
      .learn-mode & {
        color: #FF00FF; 
        border-color: #FF00FF; 
      }
      .show-cc & {
        visibility: visible;
      }
    }
    #text {
      font-family: 'Google Sans', sans-serif;
      font-weight: 500;
      font-size: clamp(1.6vmin, 3vw, 2.2vmin); 
      line-height: 1.2;
      max-width: 95%; 
      min-width: 2vmin;
      padding: 0.1em 0.3em;
      margin-top: 0.5vmin; 
      flex-shrink: 0;
      border-radius: 0.25vmin;
      text-align: center;
      white-space: wrap; 
      word-break: break-word;
      border: none;
      outline: none;
      -webkit-font-smoothing: antialiased;
      background: var(--knob-label-bg-color, #00000099); /* Themed background */
      color: var(--knob-label-text-color, #FFFFFF); /* Themed text color */

      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      position: relative; /* For suggestion box positioning */
    }
    :host([filtered=true]) #text {
      background: var(--knob-filtered-bg-color, #FF4500); /* Themed filtered background */
      color: var(--knob-filtered-text-color, #FFFFFF); /* Themed filtered text color */
    }

    .suggestions-container {
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      width: calc(100% + 20px); /* Slightly wider than the text input */
      max-width: 250px;
      background-color: var(--button-small-bg-color, #282828);
      border: 1px solid var(--button-small-border-color, #404040);
      border-top: none;
      border-radius: 0 0 4px 4px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.2);
      z-index: 100;
      max-height: 150px;
      overflow-y: auto;
    }
    .suggestions-container[hidden] {
      display: none;
    }
    .suggestion-item {
      padding: 8px 12px;
      font-size: clamp(1.4vmin, 2.8vw, 2vmin);
      color: var(--button-small-text-color, #CCCCCC);
      cursor: pointer;
      border-bottom: 1px solid var(--button-small-border-color, #404040);
      text-align: left;
    }
    .suggestion-item:last-child {
      border-bottom: none;
    }
    .suggestion-item:hover {
      background-color: var(--button-small-bg-color-hover, #383838);
    }
    .suggestion-item.loading, .suggestion-item.no-suggestions {
      font-style: italic;
      color: #888;
      cursor: default;
    }
  `;

  @property({ type: String }) promptId = '';
  @property({ type: String }) text = '';
  @property({ type: Number }) weight = 0;
  @property({ type: String }) color = '';
  @property({ type: String }) categoryKey: string | null = null;
  @property({ type: String }) sourceType: 'knob' | 'button' = 'knob';

  @property({ type: Number }) cc = 0;
  @property({ type: Number }) channel = 0; 

  @property({ type: Boolean }) learnMode = false;
  @property({ type: Boolean }) showCC = false;

  @query('weight-knob') private weightInput!: WeightKnob;
  @query('#text') private textInput!: HTMLDivElement; // Changed to HTMLDivElement

  @property({ type: Object })
  midiDispatcher: MidiDispatcher | null = null;

  @property({ type: Number }) audioLevel = 0;
  @property({ type: Boolean, reflect: true }) filtered = false;

  @property({ attribute: false }) 
  getActivePromptsContext: () => Array<{promptId: string, text: string, categoryKey: string | null, weight: number, sourceType: 'knob' | 'button'}> = () => [];

  @state() private suggestions: string[] = [];
  @state() private isLoadingSuggestions = false;
  @state() private showSuggestions = false;
  private debounceTimer: number | undefined;
  private lastValidText!: string;

  override connectedCallback() {
    super.connectedCallback();
    this.midiDispatcher?.addEventListener('cc-message', this.handleMidiMessage);
    document.addEventListener('keydown', this.handleGlobalKeyDown);
    // Click outside is handled by blur for simplicity here
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.midiDispatcher?.removeEventListener('cc-message', this.handleMidiMessage);
    document.removeEventListener('keydown', this.handleGlobalKeyDown);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  private handleMidiMessage = (e: Event) => { // Made into arrow function
    const customEvent = e as CustomEvent<ControlChange>;
    const { channel, cc, value } = customEvent.detail;
    if (this.learnMode) {
      this.cc = cc;
      this.channel = channel;
      this.learnMode = false;
      this.dispatchPromptChange();
    } else if (cc === this.cc) {
      this.weight = (value / 127) * 2;
      this.dispatchPromptChange();
    }
  };

  private handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.showSuggestions) {
      this.showSuggestions = false;
    }
  };

  override firstUpdated() {
    this.textInput.textContent = this.text;
    this.lastValidText = this.text;
  }

  update(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('showCC') && !this.showCC) {
      this.learnMode = false;
    }
    if (changedProperties.has('text') && this.textInput) {
      if (this.textInput.textContent !== this.text) { 
         this.textInput.textContent = this.text;
      }
    }
    super.update(changedProperties);
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
          cc: this.cc,
          color: this.color,
          categoryKey: this.categoryKey,
          sourceType: this.sourceType,
        },
      }),
    );
  }

  private async updateText() {
    const newText = this.textInput.textContent?.trim();
    if (!newText) {
      this.text = this.lastValidText;
      this.textInput.textContent = this.lastValidText;
    } else if (newText !== this.text) { 
      this.text = newText;
      this.lastValidText = newText;
      this.dispatchPromptChange();
    }
  }

  private onFocus() {
    this.textInput.style.display = ''; // Reset from -webkit-box
    this.textInput.style.webkitLineClamp = 'unset';
    this.textInput.style.webkitBoxOrient = 'unset';
    this.textInput.style.overflow = 'visible';

    // Show suggestions if available and input is not empty
    if (this.textInput.textContent?.trim() && this.textInput.textContent.trim().length >=2 && this.suggestions.length > 0 && !this.isLoadingSuggestions) {
        this.showSuggestions = true;
    } else if (this.textInput.textContent?.trim() && this.textInput.textContent.trim().length >=2 && this.isLoadingSuggestions) {
        this.showSuggestions = true; // Keep showing loading if it was loading
    }


    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(this.textInput);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  
  private onBlur() {
    // Hide suggestions on blur, with a small delay to allow suggestion click
    setTimeout(() => {
        if (!this.shadowRoot?.activeElement || !this.shadowRoot.activeElement.classList.contains('suggestion-item')) {
           this.showSuggestions = false;
        }
    }, 150);

    this.textInput.style.display = '-webkit-box';
    this.textInput.style.webkitLineClamp = '2';
    this.textInput.style.webkitBoxOrient = 'vertical';
    this.textInput.style.overflow = 'hidden';
    this.updateText();
  }

  private handleTextInput(e: Event) {
    const inputText = (e.target as HTMLElement).textContent || '';
    this.text = inputText; // Update internal text immediately for responsiveness

    clearTimeout(this.debounceTimer);

    if (inputText.trim().length < 2) {
      this.showSuggestions = false;
      this.suggestions = [];
      this.isLoadingSuggestions = false;
      return;
    }
    
    this.showSuggestions = true; // Show container for loading or results
    this.isLoadingSuggestions = true; // Assume loading will start
    this.suggestions = []; // Clear previous suggestions

    this.debounceTimer = window.setTimeout(() => {
      // Re-check length in case user deleted text during debounce
      if (this.textInput.textContent && this.textInput.textContent.trim().length >= 2) {
        this.fetchSuggestions(this.textInput.textContent.trim());
      } else {
        this.isLoadingSuggestions = false;
        this.showSuggestions = false;
      }
    }, 500);
  }

  private async fetchSuggestions(currentInputValue: string) {
    if (this.filtered) {
        this.isLoadingSuggestions = false;
        this.showSuggestions = false;
        return;
    }
    // isLoadingSuggestions is already true from handleTextInput

    const activePrompts = this.getActivePromptsContext();
    const otherActivePromptsText = activePrompts
      .filter(p => {
          if (p.promptId === this.promptId) return false;
          // Use specific ON_WEIGHT_TOGGLE for buttons
          const isActiveToggle = p.sourceType === 'button' && p.weight === ON_WEIGHT_TOGGLE;
          const isActiveKnob = p.sourceType === 'knob' && p.weight > 0.1;
          return (isActiveToggle || isActiveKnob) && p.text.trim() !== '';
      })
      .slice(0, 3) // Limit context prompts
      .map(p => `- "${p.text.trim()}" (for ${p.categoryKey || p.sourceType})`)
      .join('\n');
    
    const categoryName = this.categoryKey ? `'${this.categoryKey}'` : "the current sound element";

    const systemPrompt = `You are an expert creative assistant for electronic music production, specializing in 90s and 2000s techno, house, and trance genres.
The user is editing ${categoryName}.
Their current input is: "${currentInputValue}"

${otherActivePromptsText ? `Other active elements influencing the track are:\n${otherActivePromptsText}` : 'The track is currently quite open or other elements are not strongly defined.'}

Provide exactly 3 creative, concise, and directly usable keyword-focused phrase suggestions to complete or vary the user's input for ${categoryName}.
The suggestions should be lowercase. They should build upon or relate to "${currentInputValue}".
Return your response STRICTLY as a JSON array of strings. For example: ["deep rolling bass", "hypnotic acid sequence", "ethereal pads layer"]`;

    try {
      const response = await ai.models.generateContent({
        model: SUGGESTION_MODEL,
        contents: systemPrompt,
        config: { 
          responseMimeType: "application/json",
          temperature: 0.7, // Slightly higher for more variety
          topP: 0.9,
          topK: 40,
        }
      });
      let jsonStr = response.text.trim();
      const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
      const match = jsonStr.match(fenceRegex);
      if (match && match[2]) {
        jsonStr = match[2].trim();
      }
      const parsedSuggestions = JSON.parse(jsonStr);
      if (Array.isArray(parsedSuggestions) && parsedSuggestions.every(s => typeof s === 'string')) {
        this.suggestions = parsedSuggestions.slice(0, 3);
      } else {
        console.warn("Unexpected suggestions format:", parsedSuggestions);
        this.suggestions = [];
      }
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      this.suggestions = []; // Show "no suggestions" instead of error text directly
    } finally {
      this.isLoadingSuggestions = false;
      // showSuggestions remains true to display results or "no suggestions"
      if (this.suggestions.length === 0 && !this.isLoadingSuggestions){
          // If fetch completed and no suggestions, keep showing the box for "no suggestions found" message
      }
      if(!this.textInput.matches(':focus') && !this.suggestions.length) {
        this.showSuggestions = false; // if input lost focus and no suggestions, hide.
      }
    }
  }

  private handleSuggestionClick(suggestion: string) {
    this.textInput.textContent = suggestion;
    this.text = suggestion; // Update internal state
    this.lastValidText = suggestion;
    this.dispatchPromptChange(); // Update the main app
    
    this.showSuggestions = false;
    this.suggestions = [];
    this.isLoadingSuggestions = false;
    this.textInput.focus(); // Re-focus the input after selection
  }


  private updateWeight() {
    this.weight = this.weightInput.value;
    this.dispatchPromptChange();
  }

  private toggleLearnMode() {
    this.learnMode = !this.learnMode;
  }

  override render() {
    const promptDivClasses = classMap({
      'prompt': true,
      'learn-mode': this.learnMode,
      'show-cc': this.showCC,
    });

    return html`
    <div class=${promptDivClasses}>
      <weight-knob
        id="weight"
        .value=${this.weight}
        .color=${this.color}
        .audioLevel=${this.audioLevel}
        @input=${this.updateWeight}></weight-knob>
      <div
        id="text"
        contenteditable=${this.filtered ? 'false' : 'plaintext-only'}
        spellcheck="false"
        role="textbox"
        aria-multiline="false"
        @focus=${this.onFocus}
        @blur=${this.onBlur}
        @input=${this.handleTextInput}
        @keydown=${(e: KeyboardEvent) => { 
          if (e.key === 'Enter') { 
            e.preventDefault(); 
            this.textInput.blur(); 
            this.showSuggestions = false; // Hide suggestions on Enter
          }
        }}
        >${this.text}</div>
      <div id="midi" @click=${this.toggleLearnMode}>
        ${this.learnMode ? 'Learn' : `CC:${this.cc}`}
      </div>

      <div class="suggestions-container" ?hidden=${!this.showSuggestions || this.filtered}>
        ${this.isLoadingSuggestions ? html`<div class="suggestion-item loading">Loading suggestions...</div>` :
          this.suggestions.length > 0 ?
            this.suggestions.map(s => html`<div class="suggestion-item" role="option" @mousedown=${() => this.handleSuggestionClick(s)} @keydown=${(e:KeyboardEvent) => {if(e.key === 'Enter' || e.key === ' ') this.handleSuggestionClick(s)}} tabindex="0">${s}</div>`) :
            (this.textInput?.textContent?.trim()?.length ?? 0) >= 2 ? html`<div class="suggestion-item no-suggestions">No suggestions found.</div>` : ''
        }
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'prompt-controller': PromptController;
  }
}