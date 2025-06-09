/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// This is a helper function to convert base64 to Uint8Array
export function decode(base64: string): Uint8Array {
  if (typeof base64 !== 'string' || !base64) { // Check for null, undefined, or empty string
    console.warn('decode function received invalid or empty base64 input, returning empty Uint8Array.');
    return new Uint8Array(0);
  }
  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error("Error in atob decoding base64 string:", e, "Input (first 50 chars):", base64.substring(0, 50));
    return new Uint8Array(0); // Return empty array on decoding error
  }
}

// This is a helper function to convert Uint8Array to base64 
// (Not currently imported by index.tsx but kept for potential utility)
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  if (!data || data.length === 0) {
    console.warn("decodeAudioData: Received empty data array. Returning minimal silent buffer.");
    // Create a very short silent buffer to avoid errors with playback scheduling
    return ctx.createBuffer(numChannels, 1, sampleRate); 
  }

  const bytesPerSample = 2; // Assuming 16-bit PCM (Int16)
  
  if (data.length % (bytesPerSample * numChannels) !== 0) {
    console.warn(`decodeAudioData: Data length (${data.length}) is not a clean multiple for ${numChannels} channels of ${bytesPerSample}-byte samples. Audio might be incomplete or corrupted. Proceeding with floored frame count.`);
  }

  // Calculate number of frames per channel. data.length is total bytes.
  // Each sample is 2 bytes (Int16). Total samples (interleaved) = data.length / 2.
  // Frames per channel = (Total interleaved samples) / numChannels.
  const numFrames = Math.floor(data.length / (bytesPerSample * numChannels));

  if (numFrames === 0) {
    console.warn(`decodeAudioData: Calculated 0 frames from data length ${data.length} for ${numChannels} channels. Returning minimal silent buffer.`);
    return ctx.createBuffer(numChannels, 1, sampleRate); // 1 frame of silence
  }
  
  const buffer = ctx.createBuffer(
    numChannels,
    numFrames, 
    sampleRate,
  );

  // Create Int16Array view on the Uint8Array's buffer.
  // The third argument for Int16Array is the number of elements (16-bit samples), not bytes.
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.length / bytesPerSample);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < numFrames; i++) {
      const sampleIndex = i * numChannels + channel;
      // Ensure we don't read past the end of the Int16Array
      if (sampleIndex < dataInt16.length) { 
          channelData[i] = dataInt16[sampleIndex] / 32768.0; // Normalize Int16 to Float32 range [-1.0, 1.0]
      } else {
        // This case implies an issue with data length or numFrames calculation,
        // or corrupted interleaved data.
        // console.warn(`decodeAudioData: Reading beyond dataInt16 bounds at frame ${i}, channel ${channel}. Sample index ${sampleIndex} >= ${dataInt16.length}`);
        channelData[i] = 0; // Fill with silence if out of bounds to prevent errors
      }
    }
  }
  return buffer;
}
