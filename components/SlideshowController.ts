/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { LitElement, html, css, type PropertyValueMap } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

interface ImageSlot {
  url: string | null;
  opacity: number;
  transform: string;
  transformOrigin: string;
  zIndex: number; 
  transition: string;
}

const DEFAULT_FADE_DURATION = 3000; // ms
const DEFAULT_DISPLAY_DURATION = 17000; // ms, Ken Burns duration
const DEFAULT_GENERATION_INTERVAL = 20000; // ms

@customElement('slideshow-controller')
export class SlideshowController extends LitElement {
  static override styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      z-index: -1; /* Behind other content by default */
    }
    .image-container {
      width: 100%;
      height: 100%;
      position: relative;
    }
    img {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      will-change: opacity, transform; /* Hint for browser optimization */
    }
  `;

  @property({ attribute: false })
  generateImageCallback: (() => Promise<string | null>) | null = null;

  @property({ type: Number })
  interval: number = DEFAULT_GENERATION_INTERVAL;

  @property({ type: Number })
  displayDuration: number = DEFAULT_DISPLAY_DURATION;

  @property({ type: Number })
  fadeDuration: number = DEFAULT_FADE_DURATION;

  @property({ type: Boolean })
  isActive: boolean = false;

  @property({ type: String })
  backgroundColor: string = '#000';


  @state() private imageSlots: [ImageSlot, ImageSlot] = [
    { url: null, opacity: 0, transform: 'scale(1)', transformOrigin: 'center center', zIndex: 0, transition: '' },
    { url: null, opacity: 0, transform: 'scale(1)', transformOrigin: 'center center', zIndex: 0, transition: '' }
  ];

  // Index of the slot that is currently visible or in the process of becoming visible (fading in).
  @state() private currentVisibleSlotIndex = 0; 

  private generationTimerId: number | null = null;
  private isGeneratingImage = false;
  private _kenBurnsEndStates: [string, string] = ['', '']; // Stores the target transform for Ken Burns for each slot


  protected override updated(changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>): void {
    super.updated(changedProperties);
    if (changedProperties.has('isActive')) {
      if (this.isActive) {
        this.startSlideshow();
      } else {
        this.stopSlideshow();
      }
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopSlideshow();
  }

  private startSlideshow(): void {
    if (!this.isActive || !this.generateImageCallback) return;
    if (this.generationTimerId) clearTimeout(this.generationTimerId);
    
    // Generate first image immediately, then schedule subsequent ones.
    this.generateNextImage(); 
  }

  private stopSlideshow(): void {
    if (this.generationTimerId) {
      clearTimeout(this.generationTimerId);
      this.generationTimerId = null;
    }
    this.isGeneratingImage = false;

    // Fade out both images smoothly
    const fadeOutTransition = `opacity ${this.fadeDuration / 1000}s ease-in-out`;
    this.imageSlots = this.imageSlots.map(slot => ({
        ...slot,
        opacity: 0,
        transition: fadeOutTransition
    })) as [ImageSlot, ImageSlot];

    // Optionally clear URLs after fade, good for memory if using large base64 strings
    // Consider if a slight delay is needed to ensure fade completes before URL clear
    setTimeout(() => {
       if (!this.isActive) { // Double check isActive in case it was quickly re-enabled
           this.imageSlots = this.imageSlots.map(slot => ({ ...slot, url: null })) as [ImageSlot, ImageSlot];
       }
    }, this.fadeDuration + 100);
  }

  private scheduleNextGeneration(): void {
    if (this.generationTimerId) clearTimeout(this.generationTimerId);
    if (!this.isActive) return;

    this.generationTimerId = window.setTimeout(() => {
      this.generateNextImage();
    }, this.interval);
  }

  private async generateNextImage(): Promise<void> {
    if (!this.isActive || this.isGeneratingImage || !this.generateImageCallback) {
      if (this.isActive && !this.isGeneratingImage) { 
          this.scheduleNextGeneration(); // Reschedule if active but cannot generate now
      }
      return;
    }

    this.isGeneratingImage = true;
    try {
      const newImageUrl = await this.generateImageCallback();
      if (newImageUrl && this.isActive) {
        this.prepareAndDisplayImage(newImageUrl);
      }
    } catch (error) {
      console.error('Slideshow: Error calling generateImageCallback:', error);
    } finally {
      this.isGeneratingImage = false;
      if (this.isActive) { // Always schedule next if slideshow is active
        this.scheduleNextGeneration();
      }
    }
  }

  private prepareAndDisplayImage(newUrl: string): void {
    const slotToFadeOutIndex = this.currentVisibleSlotIndex;
    const slotToFadeInIndex = 1 - slotToFadeOutIndex;

    this.setupKenBurns(slotToFadeInIndex); // Sets initial transform for the new image
    
    const newImageInitialTransform = this.imageSlots[slotToFadeInIndex].transform;
    const newImageKenBurnsEndState = this._kenBurnsEndStates[slotToFadeInIndex];
    const newImageTransformOrigin = this.imageSlots[slotToFadeInIndex].transformOrigin;

    // Create a new state array for Lit to diff and update
    const updatedSlots = [...this.imageSlots] as [ImageSlot, ImageSlot];

    // Configure the slot that will fade IN (new image)
    updatedSlots[slotToFadeInIndex] = {
      ...updatedSlots[slotToFadeInIndex],
      url: newUrl,
      opacity: 0, // Start transparent
      transform: newImageInitialTransform,
      transformOrigin: newImageTransformOrigin,
      zIndex: 1,   // Bring to front
      transition: '' // Will be set just before animation
    };

    // Configure the slot that will fade OUT (current image)
    updatedSlots[slotToFadeOutIndex] = {
      ...updatedSlots[slotToFadeOutIndex],
      opacity: 0, // Target opacity for fade out
      zIndex: 0,   // Send to back
      transition: `opacity ${this.fadeDuration / 1000}s ease-in-out` // Only opacity transition
    };
    
    this.imageSlots = updatedSlots;

    // Wait for Lit to apply initial opacity:0 to the new image slot
    this.updateComplete.then(() => {
        requestAnimationFrame(() => {
            // Now, trigger the fade-in and Ken Burns animation for the new image
            const animateSlots = [...this.imageSlots] as [ImageSlot, ImageSlot];
            animateSlots[slotToFadeInIndex] = {
                ...animateSlots[slotToFadeInIndex],
                opacity: 1,
                transform: newImageKenBurnsEndState,
                transition: `opacity ${this.fadeDuration / 1000}s ease-in-out, transform ${this.displayDuration / 1000}s linear`
            };
            this.imageSlots = animateSlots;
            this.currentVisibleSlotIndex = slotToFadeInIndex; // Update the active slot index

            // After the old image has faded out, clear its URL
            setTimeout(() => {
                if (this.imageSlots[slotToFadeOutIndex]) { // Check component/slot still exists
                    const cleanupSlots = [...this.imageSlots] as [ImageSlot, ImageSlot];
                    cleanupSlots[slotToFadeOutIndex] = {
                        ...cleanupSlots[slotToFadeOutIndex],
                        url: null,
                        transform: 'scale(1)', // Reset transform
                        opacity: 0 // Ensure it's fully transparent
                    };
                    this.imageSlots = cleanupSlots;
                }
            }, this.fadeDuration + 100); // Delay slightly more than fade duration
        });
    });
  }

  private setupKenBurns(slotIndex: number): void {
    const startScale = 1 + Math.random() * 0.1; // e.g., 1.0 to 1.1
    const endScale = startScale + 0.1 + Math.random() * 0.2; // e.g., current + 0.1 to current + 0.3
    
    const startX = (Math.random() - 0.5) * 5; // -2.5% to 2.5%
    const startY = (Math.random() - 0.5) * 5;
    
    // Ensure end translation is somewhat different from start
    const endXDirection = (Math.random() < 0.5 ? -1 : 1) * (Math.abs(startX) > 1 ? 0.5 : 1); // Encourage moving away if near center
    const endYDirection = (Math.random() < 0.5 ? -1 : 1) * (Math.abs(startY) > 1 ? 0.5 : 1);
    const endX = startX + endXDirection * (5 + Math.random() * 5); // Change by 5-10%
    const endY = startY + endYDirection * (5 + Math.random() * 5);

    const originX = Math.random() * 100;
    const originY = Math.random() * 100;

    const updatedSlots = [...this.imageSlots] as [ImageSlot, ImageSlot];
    updatedSlots[slotIndex] = {
        ...updatedSlots[slotIndex],
        transformOrigin: `${originX}% ${originY}%`,
        transform: `scale(${startScale}) translate(${startX}%, ${startY}%)`,
    };
    this.imageSlots = updatedSlots; // This intermediate update is fine
    this._kenBurnsEndStates[slotIndex] = `scale(${endScale}) translate(${endX}%, ${endY}%)`;
  }

  override render() {
    return html`
      <div class="image-container" style=${styleMap({ backgroundColor: this.backgroundColor })}>
        ${this.imageSlots.map((slot) => slot.url ? html`
          <img
            src=${slot.url}
            alt="Generated background scenery"
            style=${styleMap({
              opacity: String(slot.opacity),
              transform: slot.transform,
              transformOrigin: slot.transformOrigin,
              zIndex: String(slot.zIndex),
              transition: slot.transition,
            })}
          />
        ` : '')}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'slideshow-controller': SlideshowController;
  }
}
