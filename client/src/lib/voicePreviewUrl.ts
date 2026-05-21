/** MediaRecorder 녹음 Blob → 브라우저 `<audio>` 재생용 URL (WebM 미지원 시 WAV 변환). */
export async function createVoicePlaybackPreviewUrl(blob: Blob): Promise<string> {
  if (!blob.size) {
    throw new Error("EMPTY_RECORDING");
  }

  const type = (blob.type || "").toLowerCase();
  // mp3·wav·m4a 등은 브라우저가 직접 재생 — canPlayType 검사 생략(오판 시 미리듣기·다음 버튼 둘 다 막힘)
  if (!type.includes("webm")) {
    return URL.createObjectURL(blob);
  }

  const probe = document.createElement("audio");
  if (probe.canPlayType(type || "audio/webm") !== "" || probe.canPlayType("audio/webm") !== "") {
    return URL.createObjectURL(blob);
  }

  const ctx = new AudioContext();
  try {
    const buffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
    const wav = audioBufferToWavBlob(audioBuffer);
    return URL.createObjectURL(wav);
  } finally {
    void ctx.close();
  }
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, "data");
  view.setUint32(40, dataLength, true);

  const interleaved = new Int16Array(buffer.length * numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    const channel = buffer.getChannelData(ch);
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      interleaved[i * numChannels + ch] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }

  return new Blob([header, interleaved.buffer], { type: "audio/wav" });
}
