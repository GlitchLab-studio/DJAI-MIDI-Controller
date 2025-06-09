/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
export interface Prompt {
  readonly promptId: string;
  text: string;
  weight: number;
  cc: number; // MIDI CC for knobs, index for toggles (currently not MIDI-linked)
  color: string;
  categoryKey: string | null; // Key of the category from its preset source
  sourceType: 'knob' | 'button'; // To identify which preset file it came from
}

export interface ControlChange {
  channel: number;
  cc: number;
  value: number;
}

export type PlaybackState = 'stopped' | 'playing' | 'loading' | 'paused';

// Ensure all expected fields for SettingsController are present.
export type LiveMusicGenerationConfig = {
  temperature?: number;
  topK?: number;
  topP?: number; 
  guidance?: number;
  bpm?: number; 
  seed?: number;
  scale?: string; // SCALE_UNSPECIFIED or other specific scale enums as string
  density?: number;
  brightness?: number;
  muteBass?: boolean;
  muteDrums?: boolean;
  onlyBassAndDrums?: boolean;
};
