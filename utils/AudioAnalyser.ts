/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/** Simple class for getting the current audio level. */
export class AudioAnalyser {
  readonly node: AnalyserNode;
  private readonly freqData: Uint8Array;
  
  constructor(context: AudioContext, fftSize: number = 1024) {
    this.node = context.createAnalyser();
    this.node.fftSize = fftSize;
    this.node.smoothingTimeConstant = 0.1; 
    this.node.minDecibels = -100;
    this.node.maxDecibels = -30;
    this.freqData = new Uint8Array(this.node.frequencyBinCount);
  }

  getCurrentLevel() {
    this.node.getByteFrequencyData(this.freqData);
    const avg = this.freqData.reduce((a, b) => a + b, 0) / this.freqData.length;
    // Normalize: raw byte values (0-255) to 0-1
    return avg / 255;
  }
}