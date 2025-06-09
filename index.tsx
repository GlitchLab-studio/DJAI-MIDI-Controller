/**
 * @fileoverview Control real time music with a MIDI controller
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { css, html, LitElement, type CSSResultGroup } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { GoogleGenAI, type LiveMusicSession, type LiveMusicServerMessage, type GenerateContentResponse, type AudioChunk } from '@google/genai';

import { decode, decodeAudioData } from './utils/audio'; 
import { throttle } from './utils/throttle';
import { AudioAnalyser } from './utils/AudioAnalyser';
import { MidiDispatcher } from './utils/MidiDispatcher';

import './components/WeightKnob';
import './components/PromptController';
import './components/ToggleButtonController';
import './components/SlideshowController';
import './components/BpmController';
import { PlayPauseButton } from './components/PlayPauseButton';
import { RandomizeButton } from './components/RandomizeButton'; // Import new RandomizeButton
import { ToastMessage } from './components/ToastMessage';
import './components/SettingsController'; 
import type { SettingsController } from './components/SettingsController';
import './components/FaderController'; // Ensure WeightSlider (fader) is defined


import type { Prompt, PlaybackState, LiveMusicGenerationConfig } from './types';

// Extend LiveMusicSession type to include setBpm, assuming it's a Lyria-specific capability
interface ExtendedLiveMusicSession extends LiveMusicSession {
  setBpm(params: { bpm: number }): Promise<void>;
  setMusicGenerationConfig(params: { musicGenerationConfig: LiveMusicGenerationConfig }): Promise<void>;
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = 'lyria-realtime-exp';

// Fallback prompts if preset JSON files are unavailable
const DEFAULT_PROMPTS_FALLBACK: Array<{ text: string }> = [
  // Knobs (0-11)
  { text: 'Driving Bassline' },
  { text: 'Atmospheric Pads' },
  { text: 'Synth Lead Melody' },
  { text: 'Percussive Groove' },
  { text: 'Kick Drum Pulse' },
  { text: 'Hi-Hat Pattern' },
  { text: 'Reverb Washed FX' },
  { text: 'Filtered Sweep' },
  { text: 'Arpeggiated Sequence' },
  { text: 'Snare Hit' },
  { text: 'Ambient Texture' },
  { text: 'Chord Stabs' },
  // Toggle Buttons (12-19)
  { text: 'Main Beat Active' },
  { text: 'Melody Layer On' },
  { text: 'Bassline Dominant' },
  { text: 'Effects Heavy' },
  { text: 'Minimal Section' },
  { text: 'High Energy Part' },
  { text: 'Breakdown Section' },
  { text: 'Groove Focused' },
];


const NUM_KNOBS = 12;
const NUM_TOGGLES = 8;
const TOTAL_PROMPTS = NUM_KNOBS + NUM_TOGGLES; // User-configurable prompts


const ON_WEIGHT_TOGGLE = 0.8;
const NUM_GLOBAL_HALO_BLOBS = 6;
const GLOBAL_HALO_AUDIO_INFLUENCE = 70;

const IMAGE_GENERATION_INTERVAL = 20000;
const IMAGE_DISPLAY_DURATION = 28000;
const IMAGE_FADE_DURATION = 3000;

// BPM Prompt constants
const BPM_PROMPT_ID = 'internal-bpm-prompt';
const BPM_PROMPT_WEIGHT = 0.8;


interface HaloBlob {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseSize: number;
  color: string;
  audioInfluenceRatio: number;
}

// Types for knob/button presets
interface PresetCategoryFileEntry { prompt: string; }
interface PresetsFile { [categoryKey: string]: PresetCategoryFileEntry[]; }
interface CategorizedPresets {
    [categoryKey: string]: string[];
}

// Types for new slideshow presets structure
interface SlideshowPromptEntry {
  prompt: string;
}
interface SlideshowVisualTheme {
  keywords: string[];
  prompts: SlideshowPromptEntry[];
}
interface SlideshowStyleSuffix {
  keywords: string[];
  suffix: string;
}
interface SlideshowPresetFile {
  Visual_Themes: { [categoryKey: string]: SlideshowVisualTheme };
  Final_Style_Suffixes: { [categoryKey: string]: SlideshowStyleSuffix };
}


interface AppMetadata {
  'bpm-range'?: [number, number];
  // other metadata properties
}


/** The grid of prompt inputs. */
@customElement('prompt-dj-midi')
class PromptDjMidi extends LitElement {
  static override styles: CSSResultGroup =  css`
    :host {
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: center;
      box-sizing: border-box;
      position: relative;
      
      --grid-gap: 2.8vmin;
      --item-base-width: clamp(70px, 13vw, 30vmax);
      --top-controls-height: clamp(60px, 12vh, 120px);
      --toggle-button-mobile-height: clamp(80px, 13vmin, 170px);
      --main-playback-controls-height: clamp(60px, 10vmin, 90px); /* Define height for playback controls */
      
      padding-top: var(--top-controls-height);
      padding-bottom: calc(var(--main-playback-controls-height) + 2vmin); 
    }

    #background { 
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0; 
      pointer-events: none;
      background-color: transparent !important; 
    }

    #interactive-area {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--grid-gap);
      width: 100%;
      max-width: 1024px;
      padding: 0 var(--grid-gap);
      margin-top: 3vmin; 
      box-sizing: border-box;
      position: relative;
      z-index: 1;
    }

    #knobs-grid, #toggles-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--grid-gap);
    }

    prompt-controller {
      width: var(--item-base-width);
      aspect-ratio: 1 / 1;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: visible;
    }

    toggle-button-controller {
      width: var(--item-base-width);
      height: var(--toggle-button-mobile-height);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* Default (Mobile - up to 768px) */
    #knobs-grid {
      width: calc(var(--item-base-width) * 4 + var(--grid-gap) * 3);
    }
    #toggles-row {
      width: calc(var(--item-base-width) * 4 + var(--grid-gap) * 3);
    }

    #knobs-grid > prompt-controller,
    #toggles-row > toggle-button-controller {
      display: flex;
    }

    /* Tablet (769px to 1024px) */
    @media (min-width: 600px) and (max-width: 9000px) {
      #knobs-grid {
        width: calc(var(--item-base-width) * 4 + var(--grid-gap) * 6);
      }
      #knobs-grid > prompt-controller:nth-child(n+9) {
        display: none;
      }

      #toggles-row {
        width: calc(var(--item-base-width) * 4 + var(--grid-gap) * 6);
      }
      #toggles-row > toggle-button-controller {
        aspect-ratio: 1 / 1;
        height: auto;
      }
      #toggles-row > toggle-button-controller:nth-child(n+9) { 
        display: none;
      }
    }

    /* Desktop (min-width: 1025px) */
    @media (min-width: 901px) {
      #knobs-grid {
        width: calc(var(--item-base-width) * 5 + var(--grid-gap) * 4);
      }
      #knobs-grid > prompt-controller {
        display: flex;
      }

      #toggles-row {
        width: calc(var(--item-base-width) * 6 + var(--grid-gap) * 5);
      }
      #toggles-row > toggle-button-controller {
        aspect-ratio: 1 / 1;
        height: auto;
      }
       #toggles-row > toggle-button-controller:nth-child(n+7) {
        display: none;
      }
      #toggles-row > toggle-button-controller:nth-child(-n+6) {
        display: flex;
      }
    }

    play-pause-button, randomize-button { /* Added randomize-button */
      width: 8vmin;
      height: 8vmin;
      min-width: 50px; 
      min-height: 50px;
      flex-shrink: 0; /* Prevent shrinking in flex container */
    }

    #top-controls-bar {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: var(--top-controls-height);
      padding: 0 var(--grid-gap);
      display: grid; 
      grid-template-columns: auto 1fr auto; 
      align-items: center;
      gap: 1.5vmin; 
      box-sizing: border-box;
      z-index: 2;
      background-color: rgba(20, 20, 20, 0.3);
      backdrop-filter: blur(5px);
    }

    .top-bar-left-content { 
      grid-column: 1;
      justify-self: start;
      display: flex; 
      align-items: center;
      gap: 1vmin;
    }

    #app-title-container {
      grid-column: 2; 
      justify-self: center; 
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    #app-title-container .main-title {
      font-family: 'Audiowide', cursive;
      font-size: 3vmin; 
      text-shadow:
        0 0 2px var(--app-title-shadow-primary, #FFFFFF),
        0 0 4px var(--app-title-shadow-primary, #FFFFFF),
        0 0 7px var(--app-title-shadow-secondary, #FF00FF),
        0 0 10px var(--app-title-shadow-tertiary, #9400D3);
      letter-spacing: 0.05em; 
      margin: 0;
      padding: 0;
      line-height: 1.2;
    }
    #app-title-container .main-title .title-knobs { color: var(--theme-color-cyan, #00FFFF); }
    #app-title-container .main-title .title-ai-dj { color: var(--theme-color-magenta, #FF00FF); }

    #app-title-container .subtitle {
      font-family: 'Audiowide', cursive; 
      font-size: 2vmin; 
      color: var(--app-text-color, #E0E0E0);
      letter-spacing: 0.04em;
      margin: 0.3vmin 0 0 0;
      padding: 0;
      font-weight: 300; 
      line-height: 1;
    }
    #app-title-container .subtitle .subtitle-90s { color: var(--theme-color-magenta, #FF00FF); }
    #app-title-container .subtitle .subtitle-edm { color: var(--theme-color-yellow, #FFFF00); }
    #app-title-container .subtitle .subtitle-techno { color: var(--theme-color-cyan, #00FFFF); }


    .top-bar-right-content { 
      grid-column: 3;
      justify-self: end;
    }
    
    #settings-controller-wrapper {
      width: 100%;
      display: flex;
      justify-content: center;
      margin-top: var(--grid-gap); 
      margin-bottom: var(--grid-gap); 
      padding: 0 var(--grid-gap);
      box-sizing: border-box;
      z-index: 1;
    }

    settings-controller {
      width: 100%;
      max-width: 900px; 
    }
    
    #main-playback-controls {
      position: fixed;
      bottom: 1.5vmin;
      left: 50%;
      transform: translateX(-50%);
      width: auto; 
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 2vmin; 
      padding: 1.5vmin 2.5vmin; 
      background-color: rgba(20, 20, 20, 0.7);
      backdrop-filter: blur(5px);
      border-radius: 50px; /* Fully rounded for pill shape with circular buttons */
      box-shadow: 0 -2px 10px rgba(0,0,0,0.3);
      z-index: 10; 
      height: var(--main-playback-controls-height);
    }

    /* Removed button selector as RandomizeButton is now a custom element */

    select {
      font: inherit;
      padding: 0.8vmin 1vmin; 
      font-size: 1.8vmin;
      background: #fff;
      color: #000;
      border-radius: 4px;
      border: 1.5px solid var(--button-small-border-color, #404040); 
      outline: none;
      cursor: pointer;
    }
  `;

  private prompts: Map<string, Prompt>;
  private midiDispatcher: MidiDispatcher;
  private audioAnalyser: AudioAnalyser;

  @state() private playbackState: PlaybackState = 'stopped';

  private session: ExtendedLiveMusicSession | undefined;
  private audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 48000 });
  private outputNode: GainNode = this.audioContext.createGain();
  private nextStartTime = 0;
  private readonly bufferTime = 1;

  @property({ type: Boolean }) private showMidi = false;
  @state() private overallAudioLevel = 0;
  @state() private haloBlobs: HaloBlob[] = [];


  @state() private midiInputIds: string[] = [];
  @state() private activeMidiInputId: string | null = null;

  @state() private filteredPrompts = new Set<string>();

  private audioLevelRafId: number | null = null;
  private globalHaloRafId: number | null = null;
  @state() private connectionError = true;

  @query('play-pause-button') private playPauseButton!: PlayPauseButton;
  @query('toast-message') private toastMessage!: ToastMessage;
  @query('settings-controller') private settingsControllerEl!: SettingsController;


  private knobPresetCategories: CategorizedPresets | null = null;
  private buttonPresetCategories: CategorizedPresets | null = null;
  private slideshowPresetData: SlideshowPresetFile | null = null; 
  private themeHaloColors: string[] = ['#FF00FF', '#00FFFF', '#00FF00', '#FFFF00', '#FF6600'];

  @state() private slideshowBgColor = '#111111';

  @state() private currentBpm: number = 120.0;
  @state() private minBpm: number = 110;
  @state() private maxBpm: number = 150;

  @state() private sessionSampleRate: number = 48000; 
  @state() private sessionNumChannels: number = 2;    


  private showToast(message: string) {
    if (this.toastMessage && typeof this.toastMessage.show === 'function') {
      this.toastMessage.show(message);
    } else {
      console.warn('Toast component not ready or show method unavailable. Message:', message);
      setTimeout(() => {
        if (this.toastMessage && typeof this.toastMessage.show === 'function') {
          this.toastMessage.show(message);
        } else {
          console.error('Toast component still not available. Fallback to console for message:', message);
        }
      }, 100);
    }
  }

  constructor(
    initialPrompts: Map<string, Prompt>,
    midiDispatcher: MidiDispatcher,
    knobPresets: CategorizedPresets | null,
    buttonPresets: CategorizedPresets | null,
    slideshowPresets: SlideshowPresetFile | null
  ) {
    super();
    this.prompts = initialPrompts;
    this.midiDispatcher = midiDispatcher;
    this.knobPresetCategories = knobPresets;
    this.buttonPresetCategories = buttonPresets;
    this.slideshowPresetData = slideshowPresets;

    this.audioAnalyser = new AudioAnalyser(this.audioContext, 1024);
    this.audioAnalyser.node.connect(this.audioContext.destination);
    this.outputNode.connect(this.audioAnalyser.node);
    this.updateAudioLevel = this.updateAudioLevel.bind(this);
    this.animateGlobalHalo = this.animateGlobalHalo.bind(this);
    this.initializeGlobalHaloBlobs();
    this.generateImageForSlideshow = this.generateImageForSlideshow.bind(this);
    this.fetchAppMetadata();
  }

  private async fetchAppMetadata() {
    try {
      const response = await fetch('./metadata.json');
      if (!response.ok) {
        console.error(`HTTP error! status: ${response.status} while fetching metadata.json`);
        this.initializeBpmDefaults();
        return;
      }
      const metadata: AppMetadata = await response.json();
      if (metadata && metadata['bpm-range'] && metadata['bpm-range'].length === 2) {
        this.minBpm = metadata['bpm-range'][0];
        this.maxBpm = metadata['bpm-range'][1];
        this.currentBpm = Math.max(this.minBpm, Math.min(120.0, this.maxBpm));
        console.log(`BPM range loaded: ${this.minBpm}-${this.maxBpm}, current: ${this.currentBpm}`);
      } else {
        this.initializeBpmDefaults();
      }
    } catch (error) {
      console.error('Failed to load or parse metadata.json for BPM:', error);
      this.initializeBpmDefaults();
    }
  }

  private initializeBpmDefaults() {
    this.minBpm = 110;
    this.maxBpm = 150;
    this.currentBpm = 120.0;
    console.warn(`Using default BPM range: ${this.minBpm}-${this.maxBpm}, current: ${this.currentBpm}`);
  }


  private initializeGlobalHaloBlobs() {
    const blobs: HaloBlob[] = [];
    const colorsToUse = this.themeHaloColors;

    for (let i = 0; i < NUM_GLOBAL_HALO_BLOBS; i++) {
      blobs.push({
        id: `blob-${i}`,
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        baseSize: Math.random() * 50 + 100,
        color: colorsToUse[i % colorsToUse.length],
        audioInfluenceRatio: Math.random() * 0.5 + 0.5,
      });
    }
    this.haloBlobs = blobs;
  }

  private animateGlobalHalo() {
    const newBlobs = this.haloBlobs.map(blob => {
      let newX = blob.x + blob.vx;
      let newY = blob.y + blob.vy;
      let newVx = blob.vx;
      let newVy = blob.vy;

      const currentSize = blob.baseSize + (this.overallAudioLevel * GLOBAL_HALO_AUDIO_INFLUENCE * blob.audioInfluenceRatio);

      if (newX - currentSize < 0 || newX + currentSize > window.innerWidth) {
        newVx *= -1;
        newX = blob.x + newVx;
      }
      if (newY - currentSize < 0 || newY + currentSize > window.innerHeight) {
        newVy *= -1;
        newY = blob.y + newVy;
      }
      return { ...blob, x: newX, y: newY, vx: newVx, vy: newVy };
    });
    this.haloBlobs = newBlobs;
    this.requestUpdate('haloBlobs');
    this.globalHaloRafId = requestAnimationFrame(this.animateGlobalHalo);
  }


  override connectedCallback() {
    super.connectedCallback();
    this.updateAudioLevel();
    this.animateGlobalHalo();
    this.addEventListener('prompts-changed', this.handlePromptsChangedEvent);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.audioLevelRafId !== null) {
      cancelAnimationFrame(this.audioLevelRafId);
      this.audioLevelRafId = null;
    }
    if (this.globalHaloRafId !== null) {
      cancelAnimationFrame(this.globalHaloRafId);
      this.globalHaloRafId = null;
    }
    this.removeEventListener('prompts-changed', this.handlePromptsChangedEvent);
    if (this.session) {
        try {
            this.session.close();
        } catch (e) {
            console.warn("Error closing session on disconnect:", e);
        }
        this.session = undefined;
    }
  }

  private handlePromptsChangedEvent = (e: Event) => {
    const customEvent = e as CustomEvent<Map<string, Prompt>>;
    const promptsToStore = new Map(customEvent.detail);
    promptsToStore.delete(BPM_PROMPT_ID); 
    setStoredPrompts(promptsToStore);
  };

  override async firstUpdated() {
    this.slideshowBgColor = '#111111';
    try {
      await this.connectToSession();
      if (!this.connectionError) {
        this.updateBpmSpecificPrompt();
        if (this.session && this.currentBpm !== null) {
           await this.sendCurrentBpmToSession();
        }
        if (this.settingsControllerEl && this.session) {
            this.handleSettingsChanged(
              new CustomEvent('settings-changed', {detail: this.settingsControllerEl.config })
            );
        }
      }
    } catch (error) {
      console.error("Fatal error during initial session connection:", error);
      this.connectionError = true;
      this.playbackState = 'stopped';
      this.session = undefined; 
      this.showToast("Fatal: Could not initialize music session. Check API Key and network.");
    }
  }

  private async sendCurrentBpmToSession() {
    if (this.session && this.currentBpm !== null && typeof (this.session as ExtendedLiveMusicSession).setBpm === 'function') {
      try {
        await (this.session as ExtendedLiveMusicSession).setBpm({ bpm: Math.round(this.currentBpm) });
        console.log(`Dedicated BPM ${this.currentBpm} sent to session.`);
      } catch (e) {
        console.warn("Error setting dedicated BPM on session:", e);
        if (e instanceof Error && (e.message.includes('session is closed') || e.message.includes('unavailable'))) {
            this.connectionError = true;
            this.playbackState = 'stopped';
            this.session = undefined;
            this.showToast('Session lost while setting BPM. Please restart audio.');
        }
      }
    }
  }

  private updateBpmSpecificPrompt() {
    const integerBpm = Math.round(this.currentBpm);
    const bpmPromptText = `${integerBpm}BPM`;

    const bpmPrompt: Prompt = {
        promptId: BPM_PROMPT_ID,
        text: bpmPromptText,
        weight: BPM_PROMPT_WEIGHT,
        cc: -1,
        color: 'var(--theme-color-cyan)',
        categoryKey: null,
        sourceType: 'knob',
    };
    this.prompts.set(BPM_PROMPT_ID, bpmPrompt);
    this.dispatchPromptsChange();
  }


  private async connectToSession() {
    this.connectionError = true;
    this.playbackState = 'loading';
    try {
      this.session = await ai.live.music.connect({
        model: model,
        callbacks: {
          onmessage: async (e: LiveMusicServerMessage) => {
            if (e.setupComplete) {
              this.connectionError = false;
              if (e.setupComplete.sampleRateHertz) {
                if (typeof e.setupComplete.sampleRateHertz === 'number') {
                  this.sessionSampleRate = e.setupComplete.sampleRateHertz;
                  console.log(`Session sample rate set to: ${this.sessionSampleRate} Hz`);
                }
              }
              if (e.setupComplete.channels) {
                if (typeof e.setupComplete.channels === 'number') {
                  this.sessionNumChannels = e.setupComplete.channels;
                  console.log(`Session number of channels set to: ${this.sessionNumChannels}`);
                }
              }
              await this.sendCurrentBpmToSession();
              if (this.settingsControllerEl && this.session) {
                this.handleSettingsChanged(
                    new CustomEvent('settings-changed', {detail: this.settingsControllerEl.config })
                );
              }
            }
            if (e.filteredPrompt) {
              this.filteredPrompts = new Set([...this.filteredPrompts, e.filteredPrompt.text])
              this.requestUpdate('filteredPrompts');
              this.showToast(e.filteredPrompt.filteredReason);
            }
            if (e.serverContent && e.serverContent.audioChunks && e.serverContent.audioChunks.length > 0) {
              const firstChunk: AudioChunk | undefined = e.serverContent.audioChunks[0];

              if (firstChunk && typeof firstChunk.data === 'string' && firstChunk.data.length > 0) {
                if (this.playbackState === 'paused' || this.playbackState === 'stopped') return;

                try {
                  const decodedBytes = decode(firstChunk.data);
                  if (decodedBytes.length === 0) {
                      console.warn('Decoded audio data is empty. Skipping chunk.');
                      return;
                  }

                  const sampleRate = this.sessionSampleRate;
                  const numChannels = this.sessionNumChannels;

                  const audioBuffer = await decodeAudioData(
                    decodedBytes,
                    this.audioContext,
                    sampleRate,
                    numChannels,
                  );

                  if (audioBuffer.length <= 1 && audioBuffer.duration <= (1/sampleRate + 0.0001) ) {
                     console.warn('decodeAudioData resulted in a minimal/empty buffer. Skipping playback of this chunk.');
                     return;
                  }

                  const source = this.audioContext.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(this.outputNode);

                  if (this.audioContext.state === 'suspended') {
                     await this.audioContext.resume();
                  }

                  if (this.nextStartTime === 0) {
                    this.nextStartTime = this.audioContext.currentTime + this.bufferTime;
                    setTimeout(() => {
                      if(this.playbackState === 'loading') this.playbackState = 'playing';
                    }, this.bufferTime * 1000);
                  }

                  if (this.nextStartTime < this.audioContext.currentTime) {
                    console.warn('Audio scheduling fell behind. Resetting nextStartTime.');
                    this.playbackState = 'loading';
                    this.nextStartTime = this.audioContext.currentTime + 0.1; 
                  }
                  source.start(this.nextStartTime);
                  this.nextStartTime += audioBuffer.duration;

                } catch (audioProcessingError) {
                  console.error('Error processing or playing audio chunk:', audioProcessingError);
                  this.showToast('Error playing audio. Playback might be affected.');
                }
              } else if (firstChunk) {
                 console.warn('Received audio chunk with invalid or empty data property:', firstChunk);
              } else {
                 console.warn('Received audioChunks array but the first element is undefined/null.');
              }
            }
          },
          onerror: (errEvent: Event) => { 
            let errorMessage = 'Unknown WebSocket error';
            if (errEvent instanceof ErrorEvent && errEvent.message) {
                errorMessage = errEvent.message;
            } else if ((errEvent as any).error && (errEvent as any).error.toString) {
                errorMessage = (errEvent as any).error.toString();
            } else if (errEvent.type) {
                errorMessage = `WebSocket error: ${errEvent.type}`;
            }
            console.error('LiveMusicSession WebSocket error:', errEvent, errorMessage);
            this.connectionError = true;
            this.playbackState = 'stopped';
            this.session = undefined; 
            this.resetAudioPipelineToStopped();
            if (errorMessage.toLowerCase().includes('service is currently unavailable')) {
              this.showToast('Music service is temporarily unavailable. Please try again later.');
            } else if (errorMessage.toLowerCase().includes('failed to fetch')) {
              this.showToast('Network error. Please check your connection and API Key.');
            } else {
              this.showToast('Connection error. Check console, API key/network, then retry audio.');
            }
          },
          onclose: (e: CloseEvent) => {
            console.warn('LiveMusicSession WebSocket closed:', e);
            this.connectionError = true;
            this.session = undefined; 
            if (this.playbackState !== 'stopped') {
              this.playbackState = 'stopped';
              this.resetAudioPipelineToStopped();
            }
            if (e.code !== 1000 && e.code !== 1005) { 
                this.showToast('Connection closed unexpectedly. Please restart audio.');
            } else if (this.playbackState !== 'stopped' && this.playPauseButton && this.playPauseButton.playbackState !== 'stopped'){
                this.showToast('Connection closed. Please restart audio.');
            }
          },
        },
      }) as ExtendedLiveMusicSession;
      this.connectionError = false;
    } catch (error: any) {
      console.error("Error calling ai.live.music.connect:", error);
      this.connectionError = true;
      this.playbackState = 'stopped';
      this.session = undefined;
      this.resetAudioPipelineToStopped();
      let toastMessageText = 'Failed to initiate connection. Check API Key/console.';
      if (error.message && error.message.toLowerCase().includes('api key not valid')) {
        toastMessageText = 'API Key not valid. Please check your API_KEY environment variable.';
      } else if (error.message && error.message.toLowerCase().includes('quota')) {
        toastMessageText = 'Quota exceeded. Please check your API usage.';
      }
      this.showToast(toastMessageText);
      throw error; 
    }
  }

  private resetAudioPipelineToStopped() {
    if (this.audioContext.state === 'running') {
        try {
            this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
            this.outputNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
        } catch (e) {
            console.warn("Error resetting audio gain:", e);
        }
    } else {
        this.outputNode.gain.value = 0;
    }
    this.nextStartTime = 0;
  }


  private getPromptsToSend() {
    return Array.from(this.prompts.values())
      .filter((p) => {
        return !this.filteredPrompts.has(p.text) && p.weight !== 0;
      })
  }

  private getActivePromptsContext = (): Array<{promptId: string, text: string, categoryKey: string | null, weight: number, sourceType: 'knob' | 'button'}> => {
    return Array.from(this.prompts.values()).filter(p => {
        if (p.promptId === BPM_PROMPT_ID) return false; 
        const isActiveToggle = p.sourceType === 'button' && p.weight === ON_WEIGHT_TOGGLE;
        const isActiveKnob = p.sourceType === 'knob' && p.weight > 0.1; 
        return (isActiveToggle || isActiveKnob) && p.text.trim() !== '';
    }).map(p => ({
        promptId: p.promptId,
        text: p.text,
        categoryKey: p.categoryKey,
        weight: p.weight,
        sourceType: p.sourceType
    }));
  };


  private setSessionPrompts = throttle(async () => {
    if (!this.session) {
      this.showToast('Cannot set prompts: no active session.');
      if (this.playbackState !== 'stopped') this.pause();
      return;
    }

    const promptsToSend = this.getPromptsToSend();
    if (promptsToSend.length === 0 && (this.playbackState === 'playing' || this.playbackState === 'loading')) {
      this.showToast('There needs to be one active prompt to play.')
      this.pause();
      return;
    }

    try {
      await this.session.setWeightedPrompts({
        weightedPrompts: promptsToSend,
      });
    } catch (e: any) {
      console.warn("Error setting weighted prompts:", e);
      if (e.message && (e.message.includes('session is closed') || e.message.includes('WebSocket is already in CLOSING or CLOSED state'))) {
        this.showToast('Session closed. Please restart audio.');
        this.playbackState = 'stopped';
        this.session = undefined;
        this.resetAudioPipelineToStopped();
      } else {
        this.showToast(`Error setting prompts: ${e.message}`);
      }
      if (this.playbackState !== 'stopped' && this.playbackState !== 'paused') {
          this.pause();
      }
    }
  }, 200);

  private updateAudioLevel() {
    this.audioLevelRafId = requestAnimationFrame(this.updateAudioLevel);
    this.overallAudioLevel = this.audioAnalyser.getCurrentLevel();
  }

  private dispatchPromptsChange() {
    this.dispatchEvent(
      new CustomEvent('prompts-changed', { detail: new Map(this.prompts), bubbles: true, composed: true }),
    );
    return this.setSessionPrompts();
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const { promptId, text, weight, cc, categoryKey, sourceType } = e.detail;
    const prompt = this.prompts.get(promptId);

    if (!prompt) {
      console.error('prompt not found', promptId);
      return;
    }

    if (prompt.text !== text && this.filteredPrompts.has(prompt.text)) {
        this.filteredPrompts.delete(prompt.text);
    }

    prompt.text = text;
    prompt.weight = weight;
    if (cc !== undefined && cc !== -1) {
        prompt.cc = cc;
    }
    prompt.categoryKey = categoryKey !== undefined ? categoryKey : prompt.categoryKey;
    prompt.sourceType = sourceType !== undefined ? sourceType : prompt.sourceType;


    const newPrompts = new Map(this.prompts);
    newPrompts.set(promptId, prompt);
    this.prompts = newPrompts;
    this.requestUpdate();
    this.dispatchPromptsChange();
  }

  private makeHaloLayerStyles() {
    const baseBackgroundColor = 'transparent';

    if (!this.haloBlobs || this.haloBlobs.length === 0) {
      return { background: baseBackgroundColor, pointerEvents: 'none' };
    }

    const gradients = this.haloBlobs.map(blob => {
      const currentSize = blob.baseSize + (this.overallAudioLevel * GLOBAL_HALO_AUDIO_INFLUENCE * blob.audioInfluenceRatio);
      const colorCenter = `${blob.color}99`;
      const colorMid = `${blob.color}33`;
      return `radial-gradient(circle at ${blob.x}px ${blob.y}px, ${colorCenter} ${currentSize * 0.4}px, ${colorMid} ${currentSize}px, transparent ${currentSize * 1.8}px)`;
    }).join(', ');

    return { background: `${gradients}, ${baseBackgroundColor}`, pointerEvents: 'none' };
  }


  private pause() {
    if (this.session) {
      try {
        this.session.pause();
      } catch (e) {
        console.warn("Error calling session.pause():", e);
        if (e instanceof Error && (e.message.includes("session is closed") || e.message.includes("WebSocket is already in CLOSING or CLOSED state"))) {
            this.session = undefined; 
        }
      }
    }
    this.playbackState = 'paused';
    this.resetAudioPipelineToStopped();
  }

  private play() {
    const promptsToSend = this.getPromptsToSend();
    if (promptsToSend.length === 0) {
      this.showToast('There needs to be one active prompt to play. Turn up a knob or activate a toggle to resume playback.')
      this.playbackState = 'paused'; 
      return;
    }

    if (!this.session) {
        this.showToast("Cannot play: No active session. Try restarting audio.");
        this.playbackState = 'stopped';
        if (this.playPauseButton) this.playPauseButton.requestUpdate(); 
        return;
    }

    this.audioContext.resume().then(() => {
        try {
            this.session!.play(); 
            this.playbackState = 'loading';
            this.outputNode.gain.setValueAtTime(this.outputNode.gain.value, this.audioContext.currentTime);
            this.outputNode.gain.linearRampToValueAtTime(1, this.audioContext.currentTime + 0.1);
        } catch (e) {
            console.warn("Error calling session.play():", e);
            this.showToast("Error trying to play. Session might be unstable.");
            this.playbackState = 'stopped';
            this.session = undefined; 
            this.resetAudioPipelineToStopped();
            if (this.playPauseButton) this.playPauseButton.requestUpdate();
        }
    }).catch(err => {
        console.error("Error resuming AudioContext:", err);
        this.showToast("Audio context could not be resumed. Please interact with the page.");
        this.playbackState = 'stopped';
        if (this.playPauseButton) this.playPauseButton.requestUpdate();
    });
  }

  private stop() { 
    if (this.session) {
      try {
        this.session.stop();
      } catch (e) {
        console.warn("Error calling session.stop():", e);
         if (e instanceof Error && (e.message.includes("session is closed") || e.message.includes("WebSocket is already in CLOSING or CLOSED state"))) {
         } else {
            console.error("Unexpected error during session.stop():", e);
         }
      }
    }
    this.playbackState = 'stopped';
    this.resetAudioPipelineToStopped();
    if (this.playPauseButton) this.playPauseButton.requestUpdate();
  }

  private async handlePlayPause() {
    const wasPlayingOrLoading = this.playbackState === 'playing' || this.playbackState === 'loading';
    if (wasPlayingOrLoading) {
      this.pause();
    } else if (this.playbackState === 'paused' || this.playbackState === 'stopped') {
      if (this.connectionError || !this.session) {
        this.showToast('Reconnecting...');
        this.playbackState = 'loading'; 
        if (this.playPauseButton) this.playPauseButton.requestUpdate();
        try {
            await this.connectToSession();
            if (!this.connectionError && this.session) {
                await this.setSessionPrompts(); 
                await this.sendCurrentBpmToSession(); 
                if (this.settingsControllerEl) {
                    this.handleSettingsChanged(new CustomEvent('settings-changed', { detail: this.settingsControllerEl.config }));
                }
                this.play(); 
            } else {
                this.playbackState = 'stopped'; 
                if (this.playPauseButton) this.playPauseButton.requestUpdate();
            }
        } catch (e) {
             this.playbackState = 'stopped';
             if (this.playPauseButton) this.playPauseButton.requestUpdate();
        }
      } else {
        await this.setSessionPrompts(); 
        await this.sendCurrentBpmToSession(); 
        if (this.settingsControllerEl) { 
            this.handleSettingsChanged(new CustomEvent('settings-changed', { detail: this.settingsControllerEl.config }));
        }
        this.play();
      }
    }
  }

  private async handleBpmChange(e: CustomEvent<{ bpm: number }>) {
    this.currentBpm = parseFloat(e.detail.bpm.toFixed(1));
    this.updateBpmSpecificPrompt(); 
    await this.throttledSendBpmToSession(); 
  }

  private throttledSendBpmToSession = throttle(async () => {
    if (this.session && this.playbackState !== 'stopped' && this.currentBpm !== null) {
        if (typeof (this.session as ExtendedLiveMusicSession).setBpm === 'function') {
            try {
                await (this.session as ExtendedLiveMusicSession).setBpm({ bpm: Math.round(this.currentBpm) });
                console.log(`Dedicated BPM updated to ${Math.round(this.currentBpm)}`);
            } catch (error) {
                console.error("Error setting dedicated BPM on session:", error);
                this.showToast("Error updating dedicated BPM.");
                 if (error instanceof Error && (error.message.includes('session is closed') || error.message.includes('unavailable'))) {
                    this.connectionError = true;
                    this.playbackState = 'stopped';
                    this.session = undefined;
                    this.showToast('Session lost while setting BPM. Please restart audio.');
                    if (this.playPauseButton) this.playPauseButton.requestUpdate();
                }
            }
        } else {
            console.warn("setBpm method not available on session object. BPM UI change only for dedicated endpoint.");
        }
    }
  }, 300);


  private async generateImageForSlideshow(): Promise<string | null> {
    if (!this.slideshowPresetData || !this.slideshowPresetData.Visual_Themes || !this.slideshowPresetData.Final_Style_Suffixes) {
        console.warn("Slideshow presets not loaded or incomplete. Cannot generate image with new logic.");
        return null;
    }

    const activeUserPrompts = this.getPromptsToSend().filter(p => p.promptId !== BPM_PROMPT_ID);
    const sourceText = activeUserPrompts.map(p => p.text).join(' ').toLowerCase();

    const visualThemesData = this.slideshowPresetData.Visual_Themes;
    let themeScores: Array<{ name: string, score: number, theme: SlideshowVisualTheme }> = [];

    for (const themeName in visualThemesData) {
        const theme = visualThemesData[themeName];
        let score = 0;
        if (theme.keywords && Array.isArray(theme.keywords)) {
            for (const keyword of theme.keywords) {
                try {
                    if (new RegExp(keyword.toLowerCase(), 'i').test(sourceText)) {
                        score++;
                    }
                } catch (e) {
                    console.warn(`Invalid regex for keyword '${keyword}' in theme '${themeName}':`, e);
                }
            }
        }
        themeScores.push({ name: themeName, score, theme });
    }
    themeScores.sort((a, b) => b.score - a.score);

    let primaryTheme: SlideshowVisualTheme | null = null;
    let secondaryTheme: SlideshowVisualTheme | null = null;
    const allThemeNames = Object.keys(visualThemesData);

    if (allThemeNames.length === 0) {
        console.warn("No visual themes defined in slideshow presets.");
        return null;
    }

    if (themeScores.length > 0 && themeScores[0].score > 0) {
        primaryTheme = themeScores[0].theme;
        if (themeScores.length > 1 && themeScores[1].score > 0) {
            secondaryTheme = themeScores[1].theme;
        } else if (themeScores.length > 1) {
            const availableSecondaryThemes = allThemeNames.filter(name => name !== themeScores[0].name);
            if (availableSecondaryThemes.length > 0) {
               secondaryTheme = visualThemesData[availableSecondaryThemes[Math.floor(Math.random() * availableSecondaryThemes.length)]];
            }
        } else {
             if (allThemeNames.length > 1) {
                let randomSecondaryName = themeScores[0].name;
                while(randomSecondaryName === themeScores[0].name && allThemeNames.length > 1) {
                     randomSecondaryName = allThemeNames[Math.floor(Math.random() * allThemeNames.length)];
                }
                secondaryTheme = visualThemesData[randomSecondaryName];
            }
        }
    } else {
        const randomPrimaryName = allThemeNames[Math.floor(Math.random() * allThemeNames.length)];
        primaryTheme = visualThemesData[randomPrimaryName];
        if (allThemeNames.length > 1) {
            let randomSecondaryName = randomPrimaryName;
            while (randomSecondaryName === randomPrimaryName) {
                randomSecondaryName = allThemeNames[Math.floor(Math.random() * allThemeNames.length)];
            }
            secondaryTheme = visualThemesData[randomSecondaryName];
        }
    }

    if (!primaryTheme) {
        console.warn("Could not determine a primary theme.");
        primaryTheme = visualThemesData[allThemeNames[Math.floor(Math.random() * allThemeNames.length)]];
    }


    let imagePromptParts: string[] = [];

    if (primaryTheme && primaryTheme.prompts && primaryTheme.prompts.length > 0) {
        const randomPromptEntry = primaryTheme.prompts[Math.floor(Math.random() * primaryTheme.prompts.length)];
        imagePromptParts.push(randomPromptEntry.prompt);
    } else {
        imagePromptParts.push("dynamic abstract visuals");
    }

    if (secondaryTheme && secondaryTheme.keywords && secondaryTheme.keywords.length > 0) {
        const shuffledKeywords = [...secondaryTheme.keywords].sort(() => 0.5 - Math.random());
        const mixKeywords = shuffledKeywords.slice(0, Math.min(2, shuffledKeywords.length)).filter(kw => kw.trim() !== "");
        if (mixKeywords.length > 0) {
            imagePromptParts.push(mixKeywords.join(', '));
        }
    }

    const moodPromptsText = activeUserPrompts
        .filter(p => p.categoryKey === 'mood' && p.text.trim() !== '')
        .map(p => p.text.trim());
    if (moodPromptsText.length > 0) imagePromptParts.push(moodPromptsText.join(', '));

    const structurePromptsText = activeUserPrompts
        .filter(p => p.categoryKey === 'musical_structures' && p.text.trim() !== '')
        .map(p => p.text.trim());
    if (structurePromptsText.length > 0) imagePromptParts.push(structurePromptsText.join(', '));


    const styleSuffixesData = this.slideshowPresetData.Final_Style_Suffixes;
    let finalSuffix = "";
    if (Object.keys(styleSuffixesData).length > 0) {
        let suffixScores: Array<{ name: string, score: number, suffix: string }> = [];
        for (const suffixName in styleSuffixesData) {
            const style = styleSuffixesData[suffixName];
            let score = 0;
            if (style.keywords && Array.isArray(style.keywords)) {
                 if (style.keywords.length > 0 && sourceText.trim() === "") score = 0.5;

                for (const keyword of style.keywords) {
                    try {
                        if (new RegExp(keyword.toLowerCase(), 'i').test(sourceText)) {
                            score++;
                        }
                    } catch (e) {
                        console.warn(`Invalid regex for suffix keyword '${keyword}' in '${suffixName}':`, e);
                    }
                }
            }
            suffixScores.push({ name: suffixName, score, suffix: style.suffix });
        }
        suffixScores.sort((a, b) => b.score - a.score);

        if (suffixScores.length > 0 && suffixScores[0].score > 0) {
            finalSuffix = suffixScores[0].suffix;
        } else {
            const defaultSuffixStyle = styleSuffixesData['Default_Dynamic_Style'] || styleSuffixesData['Abstract_Digital_90s_Style'];
            if (defaultSuffixStyle && defaultSuffixStyle.suffix) {
                finalSuffix = defaultSuffixStyle.suffix;
            } else if (suffixScores.length > 0) {
                finalSuffix = suffixScores[Math.floor(Math.random() * suffixScores.length)].suffix;
            }
        }
    }

    if (!finalSuffix.trim() && Object.keys(styleSuffixesData).length > 0) {
         const anySuffixKey = Object.keys(styleSuffixesData)[0];
         finalSuffix = styleSuffixesData[anySuffixKey]?.suffix || ", abstract digital art, motion, energy";
    } else if (!finalSuffix.trim()) {
        finalSuffix = ", abstract digital art, motion, energy, light patterns, 90s aesthetic, vibrant neon";
    }


    if (finalSuffix) imagePromptParts.push(finalSuffix);
    imagePromptParts.push(`${Math.round(this.currentBpm)} BPM`);

    let imagePromptText = imagePromptParts.filter(part => part && part.trim() !== '').join(', ');

    if (!imagePromptText.trim()) {
        console.warn("Image prompt text is empty after construction.");
        return null;
    }

    if (imagePromptText.length > 350) {
        imagePromptText = imagePromptText.substring(0, 347) + "...";
    }

    console.log("Generated Image Prompt:", imagePromptText);

    try {
        const response = await ai.models.generateImages({
            model: 'imagen-3.0-generate-002',
            prompt: imagePromptText,
            config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
        });

        if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image?.imageBytes) {
            const base64ImageBytes = response.generatedImages[0].image.imageBytes;
            return `data:image/jpeg;base64,${base64ImageBytes}`;
        }
        console.warn("Image generation response did not contain valid image data.");
        return null;
    } catch (error) {
        console.error('Error generating image for slideshow:', error);
        return null;
    }
  }

  private async toggleShowMidi() {
    this.showMidi = !this.showMidi;
    if (!this.showMidi) return;
    const inputIds = await this.midiDispatcher.getMidiAccess();
    this.midiInputIds = inputIds;
    this.activeMidiInputId = this.midiDispatcher.activeMidiInputId;
  }

  private handleMidiInputChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const newMidiId = selectElement.value;
    this.activeMidiInputId = newMidiId;
    this.midiDispatcher.activeMidiInputId = newMidiId;
  }

  private async resetAll() {
    const defaultUserPrompts = buildDefaultPrompts(this.knobPresetCategories, this.buttonPresetCategories, this.themeHaloColors);
    this.prompts = defaultUserPrompts;
    this.filteredPrompts = new Set<string>();

    if (this.minBpm && this.maxBpm) {
        this.currentBpm = Math.max(this.minBpm, Math.min(120.0, this.maxBpm));
    } else {
        this.initializeBpmDefaults(); 
    }
    this.updateBpmSpecificPrompt(); 

    if (this.settingsControllerEl) {
        this.settingsControllerEl.resetToDefaults(); 
    } else { 
        if (this.session) {
            try {
                await this.session.setMusicGenerationConfig({ musicGenerationConfig: {} });
            } catch (err) { console.error("Error clearing music gen config on reset:", err); }
        }
    }
    
    await this.sendCurrentBpmToSession(); 

    let toastMessageText = 'All prompts & settings reset.';

    if (this.playbackState === 'stopped' || this.playbackState === 'paused') {
      if (this.connectionError || !this.session) {
        this.showToast('Reconnecting...');
        this.playbackState = 'loading';
        if (this.playPauseButton) this.playPauseButton.requestUpdate();
        try {
            await this.connectToSession();
            if (!this.connectionError && this.session) {
              await this.setSessionPrompts(); 
              await this.sendCurrentBpmToSession(); 
              if (this.settingsControllerEl) {
                this.handleSettingsChanged(new CustomEvent('settings-changed', { detail: this.settingsControllerEl.config }));
              }
              this.play();
              toastMessageText = 'All prompts & settings reset & playback started!';
            } else {
              this.playbackState = 'stopped';
              toastMessageText = 'All prompts & settings reset. Reconnection failed.';
              if (this.playPauseButton) this.playPauseButton.requestUpdate();
            }
        } catch(e) {
             this.playbackState = 'stopped';
             toastMessageText = 'All prompts & settings reset. Reconnection critically failed.';
             if (this.playPauseButton) this.playPauseButton.requestUpdate();
        }
      } else {
        await this.setSessionPrompts(); 
        await this.sendCurrentBpmToSession(); 
        if (this.settingsControllerEl) {
             this.handleSettingsChanged(new CustomEvent('settings-changed', { detail: this.settingsControllerEl.config }));
        }
        this.play();
        toastMessageText = 'All prompts & settings reset & playback started!';
      }
    } else {
      // If already playing, apply prompts and settings, then continue.
      await this.setSessionPrompts(); 
      await this.sendCurrentBpmToSession();
      if (this.settingsControllerEl) {
           this.handleSettingsChanged(new CustomEvent('settings-changed', { detail: this.settingsControllerEl.config }));
      }
      toastMessageText = 'All prompts & settings reset. Music updated.';
    }
    this.showToast(toastMessageText);
  }

  private async handleSettingsChanged(e: CustomEvent<LiveMusicGenerationConfig>) {
    if (this.session && !this.connectionError) {
        try {
            await this.session.setMusicGenerationConfig({ musicGenerationConfig: e.detail });
            console.log("Music generation config updated via settings controller:", e.detail);
        } catch (err) {
            console.error("Error setting music generation config from settings controller:", err);
            this.showToast("Error updating music settings.");
            if (err instanceof Error && (err.message.includes('session is closed') || err.message.includes('unavailable'))) {
                this.connectionError = true;
                this.playbackState = 'stopped';
                this.session = undefined;
                this.showToast('Session lost while updating settings. Please restart audio.');
                if (this.playPauseButton) this.playPauseButton.requestUpdate();
            }
        }
    } else if (!this.session || this.connectionError) {
        console.log("Settings changed, but session not active. Will apply on connection.");
    }
  }


  override render() {
    const userPromptsList = Array.from(this.prompts.values()).filter(p => p.promptId !== BPM_PROMPT_ID);
    const knobPrompts = userPromptsList.slice(0, NUM_KNOBS);
    const togglePrompts = userPromptsList.slice(NUM_KNOBS);

    return html`
      <slideshow-controller
        .generateImageCallback=${this.generateImageForSlideshow}
        .interval=${IMAGE_GENERATION_INTERVAL}
        .displayDuration=${IMAGE_DISPLAY_DURATION}
        .fadeDuration=${IMAGE_FADE_DURATION}
        ?isActive=${this.playbackState === 'playing' || this.playbackState === 'loading'}
        .backgroundColor=${this.slideshowBgColor}
      ></slideshow-controller>

      <div id="background" style=${styleMap(this.makeHaloLayerStyles())}></div>

      <div id="top-controls-bar">
        <div class="top-bar-left-content">
          <button
            @click=${this.toggleShowMidi}
            class=${this.showMidi ? 'active' : ''}
            aria-pressed=${this.showMidi}
            title=${this.showMidi ? 'Hide MIDI Controls' : 'Show MIDI Controls'}
            >MIDI</button
          >
          <select
            @change=${this.handleMidiInputChange}
            .value=${this.activeMidiInputId || ''}
            aria-label="Select MIDI Input Device"
            ?hidden=${!this.showMidi}>
            ${this.midiInputIds.length > 0
          ? this.midiInputIds.map(
            (id) =>
              html`<option value=${id}>
                      ${this.midiDispatcher.getDeviceName(id)}
                    </option>`,
          )
          : html`<option value="">No MIDI devices found</option>`}
          </select>
        </div>

        <div id="app-title-container">
          <h1 class="main-title">
            <span class="title-knobs">MIDI </span><span class="title-ai-dj">D-JAI</span><span class="title-techno"> 1.6</span>
          </h1>
          <h2 class="subtitle">
            <span class="subtitle-90s">MIDI</span> <span class="subtitle-techno">Controller</span> <span class="subtitle-edm">AI</span> <span class="subtitle-techno">Music Generator</span>
          </h2>
        </div>

        <div class="top-bar-right-content">
          <bpm-controller
            .currentBpm=${this.currentBpm}
            .minBpm=${this.minBpm}
            .maxBpm=${this.maxBpm}
            @bpm-changed=${this.handleBpmChange}
          ></bpm-controller>
        </div>
      </div>

      <div id="interactive-area">
        <div id="knobs-grid">
          ${knobPrompts.map((prompt) => html`
            <prompt-controller
              .promptId=${prompt.promptId}
              .filtered=${this.filteredPrompts.has(prompt.text)}
              .cc=${prompt.cc}
              .text=${prompt.text}
              .weight=${prompt.weight}
              .color=${prompt.color}
              .midiDispatcher=${this.midiDispatcher}
              .showCC=${this.showMidi}
              .audioLevel=${this.overallAudioLevel}
              .categoryKey=${prompt.categoryKey}
              .sourceType=${prompt.sourceType}
              .getActivePromptsContext=${this.getActivePromptsContext}
              @prompt-changed=${this.handlePromptChanged}>
            </prompt-controller>
          `)}
        </div>
        <div id="toggles-row">
          ${togglePrompts.map((prompt) => html`
            <toggle-button-controller
              .promptId=${prompt.promptId}
              .text=${prompt.text}
              .weight=${prompt.weight}
              .color=${prompt.color}
              .filtered=${this.filteredPrompts.has(prompt.text)}
              .audioLevel=${this.overallAudioLevel}
              .categoryKey=${prompt.categoryKey}
              .sourceType=${prompt.sourceType}
              @prompt-changed=${this.handlePromptChanged}>
            </toggle-button-controller>
          `)}
        </div>
      </div>

      <div id="settings-controller-wrapper">
        <settings-controller
            @settings-changed=${this.handleSettingsChanged}
        ></settings-controller>
      </div>

      <div id="main-playback-controls">
        <play-pause-button 
            .playbackState=${this.playbackState} 
            @click=${this.handlePlayPause}
        ></play-pause-button>
        <randomize-button 
            @click=${this.resetAll}
        ></randomize-button>
      </div>
      
      <toast-message></toast-message>`;
  }
}

async function fetchAndProcessPresets(filePath: string): Promise<CategorizedPresets | null> {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status} while fetching ${filePath}`);
      return null;
    }
    const presetsData = await response.json() as PresetsFile;
    const categorized: CategorizedPresets = {};
    let totalPrompts = 0;
    for (const categoryKey in presetsData) {
      if (Object.prototype.hasOwnProperty.call(presetsData, categoryKey)) {
        categorized[categoryKey] = presetsData[categoryKey].map(p => p.prompt);
        totalPrompts += categorized[categoryKey].length;
      }
    }
    if (totalPrompts === 0) {
      console.warn(`No prompts found in ${filePath}.`);
      return null;
    }
    console.log(`Successfully loaded and processed ${filePath} for knobs/buttons`);
    return categorized;
  } catch (error) {
    console.error(`Failed to load or parse ${filePath}:`, error);
    return null;
  }
}

async function fetchSlideshowPresets(filePath: string): Promise<SlideshowPresetFile | null> {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status} while fetching ${filePath}`);
      return null;
    }
    const presetsData = await response.json() as SlideshowPresetFile;
    if (!presetsData.Visual_Themes || !presetsData.Final_Style_Suffixes) {
        console.error(`Invalid structure in ${filePath}. Missing Visual_Themes or Final_Style_Suffixes.`);
        return null;
    }
    console.log(`Successfully loaded and processed ${filePath} for slideshow`);
    return presetsData;
  } catch (error) {
    console.error(`Failed to load or parse ${filePath}:`, error);
    return null;
  }
}


async function main(parent: HTMLElement) {
  const themeHaloColors = [
      'var(--halo-blob-color-1, #FF00FF)',
      'var(--halo-blob-color-2, #00FFFF)',
      'var(--halo-blob-color-3, #00FF00)',
      'var(--halo-blob-color-4, #FFFF00)',
      'var(--halo-blob-color-5, #FF6600)'
  ];

  const midiDispatcher = new MidiDispatcher();

  const knobPresets = await fetchAndProcessPresets('./presets/knob_prompt_presets.json');
  const buttonPresets = await fetchAndProcessPresets('./presets/button_prompt_presets.json');
  const slideshowPresetData = await fetchSlideshowPresets('./presets/slideshow_prompt_presets.json');

  const initialPrompts = getInitialPrompts(knobPresets, buttonPresets, themeHaloColors);

  const pdjMidi = new PromptDjMidi(
    initialPrompts,
    midiDispatcher,
    knobPresets,
    buttonPresets,
    slideshowPresetData
  );
  parent.appendChild(pdjMidi);
}

function getInitialPrompts(
    knobPresetCategories: CategorizedPresets | null,
    buttonPresetCategories: CategorizedPresets | null,
    themeHaloColors: string[]
): Map<string, Prompt> {
  const { localStorage } = window;
  const storedPromptsString = localStorage.getItem('prompts');
  const defaultPromptsMap = buildDefaultPrompts(knobPresetCategories, buttonPresetCategories, themeHaloColors);

  if (storedPromptsString) {
    try {
      const storedPromptsArray = JSON.parse(storedPromptsString) as Prompt[];
      if (Array.isArray(storedPromptsArray)) {
        const storedPromptsMap = new Map(storedPromptsArray.map(p => [p.promptId, p]));

        storedPromptsMap.delete(BPM_PROMPT_ID);

        const finalPrompts = new Map<string, Prompt>();
        defaultPromptsMap.forEach((defaultPrompt, promptId) => {
            const storedPrompt = storedPromptsMap.get(promptId);
            if (storedPrompt) {
                 finalPrompts.set(promptId, {
                    ...defaultPrompt,
                    text: storedPrompt.text !== undefined ? storedPrompt.text : defaultPrompt.text,
                    weight: storedPrompt.weight !== undefined ? storedPrompt.weight : defaultPrompt.weight,
                    cc: storedPrompt.cc !== undefined ? storedPrompt.cc : defaultPrompt.cc,
                    color: defaultPrompt.color, // Always take default color for theme consistency
                    sourceType: storedPrompt.sourceType || defaultPrompt.sourceType,
                    categoryKey: storedPrompt.categoryKey !== undefined ? storedPrompt.categoryKey : defaultPrompt.categoryKey,
                });
            } else {
                finalPrompts.set(promptId, defaultPrompt);
            }
        });

        console.log('Loaded and merged stored user prompts with new defaults.');
        return finalPrompts;
      }
    } catch (e) {
      console.error('Failed to parse stored prompts, using default user prompts.', e);
    }
  }

  console.log('No valid stored user prompts or error in parsing, using default user prompts.');
  return defaultPromptsMap;
}


function buildDefaultPrompts(
    knobPresetCategories: CategorizedPresets | null,
    buttonPresetCategories: CategorizedPresets | null,
    themeHaloColors: string[]
): Map<string, Prompt> {
    const prompts = new Map<string, Prompt>();

    const knobCategoryKeys = Object.keys(knobPresetCategories || {});
    const buttonCategoryKeys = Object.keys(buttonPresetCategories || {});

    const knobPromptsCount = NUM_KNOBS;
    const startOnIndices = new Set<number>();
    const numStartOn = knobPromptsCount > 0 ? Math.floor(Math.random() * Math.min(3, knobPromptsCount)) + 1 : 0;

    while(startOnIndices.size < numStartOn && knobPromptsCount > 0) {
        startOnIndices.add(Math.floor(Math.random() * knobPromptsCount));
    }

    for (let i = 0; i < TOTAL_PROMPTS; i++) {
        const promptId = `prompt-${i}`;
        const color = themeHaloColors[i % themeHaloColors.length];
        const sourceType: 'knob' | 'button' = i < NUM_KNOBS ? 'knob' : 'button';

        let categoryKey: string | null = null;
        let text: string;
        const relevantFallbackText = DEFAULT_PROMPTS_FALLBACK[i % DEFAULT_PROMPTS_FALLBACK.length]?.text || `Fallback ${i + 1}`;


        const currentPresets = sourceType === 'knob' ? knobPresetCategories : buttonPresetCategories;
        const currentCategoryKeys = sourceType === 'knob' ? knobCategoryKeys : buttonCategoryKeys;

        if (currentPresets && currentCategoryKeys.length > 0) {
            const catIndex = sourceType === 'knob' ? (i % currentCategoryKeys.length) : ((i - NUM_KNOBS) % currentCategoryKeys.length);
            categoryKey = currentCategoryKeys[catIndex];

            if (categoryKey && currentPresets[categoryKey] && currentPresets[categoryKey].length > 0) {
                text = currentPresets[categoryKey][Math.floor(Math.random() * currentPresets[categoryKey].length)];
            } else {
                const allTextsFromSourceType: string[] = [];
                Object.values(currentPresets).forEach(arr => allTextsFromSourceType.push(...arr));
                if (allTextsFromSourceType.length > 0) {
                    text = allTextsFromSourceType[Math.floor(Math.random() * allTextsFromSourceType.length)];
                } else {
                    text = relevantFallbackText;
                }
                categoryKey = null;
            }
        } else if (currentPresets) {
            const allTextsFromSourceType: string[] = [];
            Object.values(currentPresets).forEach(arr => allTextsFromSourceType.push(...arr));
            if (allTextsFromSourceType.length > 0) {
                text = allTextsFromSourceType[Math.floor(Math.random() * allTextsFromSourceType.length)];
            } else {
                text = relevantFallbackText;
            }
            categoryKey = null;
        } else {
            text = relevantFallbackText;
            categoryKey = null;
        }

        let initialWeight = 0;
        if (sourceType === 'knob') {
            if (startOnIndices.has(i)) {
                initialWeight = 1;
            }
        }

        prompts.set(promptId, {
            promptId,
            text,
            weight: initialWeight,
            cc: i,
            color,
            categoryKey,
            sourceType,
        });
    }

    const togglePromptsList: Prompt[] = [];
    prompts.forEach(prompt => {
        if (prompt.sourceType === 'button') {
            prompt.weight = 0;
            togglePromptsList.push(prompt);
        }
    });

    if (togglePromptsList.length > 0) {
        const randomIndex = Math.floor(Math.random() * togglePromptsList.length);
        const activeTogglePrompt = prompts.get(togglePromptsList[randomIndex].promptId);
        if (activeTogglePrompt) {
             activeTogglePrompt.weight = ON_WEIGHT_TOGGLE;
        }
    }
    return prompts;
}

function setStoredPrompts(promptsToStore: Map<string, Prompt>) {
  const storedPrompts = JSON.stringify(Array.from(promptsToStore.values()));
  const { localStorage } = window;
  localStorage.setItem('prompts', storedPrompts);
}

main(document.body);