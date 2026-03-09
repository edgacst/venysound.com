import { createContext, useContext, useRef, type RefObject } from "react";

/** 전역 라디오 플레이어의 파형 데이터. GlobalRadioPlayer가 채우고, RadioChannel 리스너가 캔버스에 그림. */
const RadioWaveformContext = createContext<RefObject<Uint8Array | null> | null>(null);

export function useRadioWaveformRef(): RefObject<Uint8Array | null> | null {
  return useContext(RadioWaveformContext);
}

export function RadioWaveformProvider({
  waveformBufferRef,
  children,
}: {
  waveformBufferRef: RefObject<Uint8Array | null>;
  children: React.ReactNode;
}) {
  return (
    <RadioWaveformContext.Provider value={waveformBufferRef}>
      {children}
    </RadioWaveformContext.Provider>
  );
}
