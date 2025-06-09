/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { css, html, LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

@customElement('bpm-controller')
export class BpmController extends LitElement {
  static override styles = css`
    :host {
      display: block; /* No longer fixed positioned */
      /* Removed: position, top, right, z-index */
    }

    .bpm-container {
      display: flex;
      flex-direction: column;
      align-items: center; /* Center fader below button */
      position: relative; /* For fader absolute positioning relative to container if needed */
    }

    .bpm-display-button {
      font-family: 'Audiowide', 'Google Sans', sans-serif;
      font-weight: 600;
      cursor: pointer;
      color: var(--button-small-text-color, #CCCCCC);
      background: var(--button-small-bg-color, #282828);
      border: 1.5px solid var(--button-small-border-color, #404040);
      border-radius: 4px;
      user-select: none;
      padding: 0.8vmin 1.5vmin; /* Matched button styling from index.tsx */
      font-size: 1.8vmin; /* Matched button styling from index.tsx */
      min-width: 70px; /* Ensure enough space for "120.0" */
      text-align: center;
      transition: background-color 0.2s, border-color 0.2s;
    }
    .bpm-display-button:hover {
      background-color: var(--button-small-bg-color-hover, #383838);
      border-color: var(--button-small-border-color-hover, #505050);
    }

    .fader-wrapper {
      position: absolute; /* Position fader below the button */
      top: calc(100% + 8px); /* 8px space below the button */
    
      /* Consider 'left: 50%; transform: translateX(-50%);' for centering below button */
      z-index: 10; /* Ensure fader is above other content in the bar if it overlaps */
      background-color: var(--button-small-bg-color, #282828);
      border: 1.5px solid var(--button-small-border-color, #404040);
      border-radius: 6px;
      padding: 10px 25px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      overflow: hidden;
      transition: max-height 0.3s ease-in-out, opacity 0.3s ease-in-out, transform 0.3s ease-in-out, padding 0.3s ease-in-out, border-width 0.3s ease-in-out;
      transform-origin: top center;
    }


    .fader-wrapper.hidden {
      max-height: 0;
      opacity: 0;
      transform: translateY(-10px) scaleY(0.95);
      pointer-events: none;
      border-top-width: 0;
      border-bottom-width: 0;
      padding-top: 0;
      padding-bottom: 0;
      margin-top:0; /* No margin when hidden */
    }

    .fader-wrapper.visible {
      max-height: 220px; /* Approximate height for fader + padding */
      opacity: 0.8;
      transform: translateY(0) scaleY(1);
      pointer-events: auto;
    }

    input[type="range"][orient="vertical"] {
      writing-mode: bt-lr; /* Bottom to top, left to right */
      -webkit-appearance: slider-vertical;
      appearance: slider-vertical; /* Standard */
      width: 22px;
      height: 180px;
      padding: 0;
      margin: 0 auto; /* Center in wrapper */
      background: transparent; /* Track styled separately */
      cursor: pointer;
      border-radius: 8px; /* For focus outline if any */
    }

    /* Webkit/Blink Thumb */
    input[type="range"][orient="vertical"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 28px; 
      height: 14px;
      background: var(--theme-color-cyan, #00FFFF);
      border-radius: 3px;
      border: 1px solid rgba(0,0,0,0.2);
      box-shadow: 0 0 2px rgba(0,0,0,0.3);
      margin-top: -6px; /* Centers thumb on track in webkit */
    }

    /* Mozilla Thumb */
    input[type="range"][orient="vertical"]::-moz-range-thumb {
      width: 28px;
      height: 14px;
      background: var(--theme-color-cyan, #00FFFF);
      border-radius: 3px;
      border: 1px solid rgba(0,0,0,0.2);
      box-shadow: 0 0 2px rgba(0,0,0,0.3);
      cursor: pointer;
    }
    
    /* Webkit/Blink Track */
    input[type="range"][orient="vertical"]::-webkit-slider-runnable-track {
      width: 8px; /* Thickness of the track */
      height: 100%; /* Length of the track */
      background: #505050; /* Darker track color */
      border-radius: 4px;
      border: 1px solid #1c1c1c;
    }

    /* Mozilla Track */
    input[type="range"][orient="vertical"]::-moz-range-track {
      width: 8px;
      height: 100%;
      background: #505050;
      border-radius: 4px;
      border: 1px solid #1c1c1c;
    }
  `;

  @property({ type: Number }) currentBpm = 120.0;
  @property({ type: Number }) minBpm = 80.0;
  @property({ type: Number }) maxBpm = 180.0;

  @state() private isFaderVisible = false;

  private toggleFader() {
    this.isFaderVisible = !this.isFaderVisible;
  }

  private handleFaderInput(event: Event) {
    const target = event.target as HTMLInputElement;
    let newBpm = parseFloat(target.value);

    this.currentBpm = newBpm;
    this.dispatchEvent(
      new CustomEvent('bpm-changed', {
        detail: { bpm: this.currentBpm },
        bubbles: true,
        composed: true,
      })
    );
  }

  override render() {
    const faderWrapperClasses = {
      'fader-wrapper': true,
      'visible': this.isFaderVisible,
      'hidden': !this.isFaderVisible,
    };

    return html`
      <div class="bpm-container">
        <button
          class="bpm-display-button"
          @click=${this.toggleFader}
          title="Toggle BPM Fader"
          aria-pressed=${this.isFaderVisible}
          aria-controls="bpm-fader"
        >
          ${this.currentBpm.toFixed(1)}
        </button>
        <div class=${classMap(faderWrapperClasses)}>
          <input
            id="bpm-fader"
            type="range"
            orient="vertical"
            min=${this.minBpm}
            max=${this.maxBpm}
            .value=${String(this.currentBpm)} 
            step="0.1"
            @input=${this.handleFaderInput}
            aria-label="BPM Fader"
          />
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'bpm-controller': BpmController;
  }
}