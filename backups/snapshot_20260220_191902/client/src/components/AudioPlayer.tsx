"use client";

import { create } from "zustand";
import { useCallback, useEffect, useRef, useState } from "react";
import AudioPlayerLib from "react-h5-audio-player";
import "react-h5-audio-player/lib/styles.css";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

type PlayerState = {
  queue: number[];
  activeMusicId: number | null;
  isPlaying: boolean;
  pauseRequested: boolean;
  lyricsRequested: boolean;
  playMusic: (musicId: number) => void;
  playMusicWithLyrics: (musicId: number) => void;
  setPlaylist: (musicIds: number[]) => void;
  addToQueue: (musicId: number) => void;
  togglePause: () => void;
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  activeMusicId: null,
  isPlaying: false,
  pauseRequested: false,
  lyricsRequested: false,

  playMusic: (musicId: number) => {
    set((s) => ({
      queue: s.queue.length > 0 ? s.queue : [musicId],
      activeMusicId: musicId,
      isPlaying: true,
      lyricsRequested: false,
      pauseRequested: false,
    }));
  },

  playMusicWithLyrics: (musicId: number) => {
    set((s) => ({
      queue: s.queue.length > 0 ? s.queue : [musicId],
      activeMusicId: musicId,
      isPlaying: true,
      lyricsRequested: true,
      pauseRequested: false,
    }));
  },

  setPlaylist: (musicIds: number[]) => {
    set({ queue: musicIds || [] });
  },

  addToQueue: (musicId: number) => {
    const { queue } = get();
    if (queue.includes(musicId)) return;
    set({ queue: [...queue, musicId] });
  },

  togglePause: () => {
    set((s) => ({ isPlaying: !s.isPlaying, pauseRequested: true }));
  },
}));

function parseLrc(lrc: string): { time: number; text: string }[] {
  const lines = lrc.split(/\r?\n/);
  const result: { time: number; text: string }[] = [];
  const tag = /^\[(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?\]\s*(.*)$/;
  for (const line of lines) {
    const m = line.match(tag);
    if (!m) continue;
    const [, min, sec, ms, text] = m;
    const time =
      parseInt(min!, 10) * 60 +
      parseInt(sec!, 10) +
      (parseInt(ms || "0", 10) || 0) / 1000;
    result.push({ time, text: (text || "").trim() });
  }
  result.sort((a, b) => a.time - b.time);
  return result;
}

function SyncedLyricsPanel({
  lyrics,
  currentTime,
  className,
}: {
  lyrics: string;
  currentTime: number;
  className?: string;
}) {
  const lines = parseLrc(lyrics);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    let i = -1;
    for (let j = 0; j < lines.length; j++) {
      if (lines[j].time <= currentTime) i = j;
      else break;
    }
    setActiveIndex(i);
  }, [currentTime, lines]);

  useEffect(() => {
    if (activeIndex < 0 || !containerRef.current) return;
    const el = containerRef.current.querySelector(
      `[data-line-index="${activeIndex}"]`
    );
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIndex]);

  if (!lines.length) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "overflow-y-auto max-h-[40vh] py-4 text-center space-y-1",
        className
      )}
    >
      {lines.map(({ time, text }, index) => (
        <div
          key={`${time}-${index}`}
          data-line-index={index}
          className={cn(
            "text-2xl transition-colors duration-150",
            index === activeIndex
              ? "text-primary font-medium"
              : "text-muted-foreground"
          )}
        >
          {text || "\u00a0"}
        </div>
      ))}
    </div>
  );
}

export function GlobalAudioPlayer() {
  const {
    queue,
    activeMusicId,
    isPlaying,
    set,
    togglePause,
  } = usePlayerStore();
  const playerRef = useRef<any>(null);
  const [currentTime, setCurrentTime] = useState(0);

  const currentIndex = activeMusicId
    ? queue.findIndex((id) => id === activeMusicId)
    : -1;
  const hasNext = currentIndex >= 0 && currentIndex < queue.length - 1;
  const nextId = hasNext ? queue[currentIndex + 1] : null;

  const { data: musicData } = useQuery({
    queryKey: ["/api/music", activeMusicId],
    queryFn: async () => {
      if (!activeMusicId) return null;
      const res = await fetch(`/api/music/${activeMusicId}`);
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    enabled: !!activeMusicId,
  });

  useEffect(() => {
    const id = setInterval(() => {
      const el = playerRef.current?.audio?.current;
      if (el) setCurrentTime(el.currentTime);
    }, 250);
    return () => clearInterval(id);
  }, [activeMusicId]);

  useEffect(() => {
    const el = playerRef.current?.audio?.current;
    if (!el) return;
    if (!isPlaying) {
      el.pause();
    } else if (el.paused && el.src) {
      el.play().catch(() => {});
    }
  }, [isPlaying, activeMusicId]);

  const handlePlay = useCallback(() => {
    set({ isPlaying: true, pauseRequested: false });
  }, [set]);

  const handlePause = useCallback(() => {
    set({ isPlaying: false });
  }, [set]);

  const handleEnded = useCallback(() => {
    if (nextId != null) {
      set({
        activeMusicId: nextId,
        isPlaying: true,
        lyricsRequested: false,
      });
    } else {
      set({ isPlaying: false, activeMusicId: null });
    }
  }, [nextId, set]);

  if (!activeMusicId) return null;

  const streamUrl = `/api/music/${activeMusicId}/stream`;
  const showLyrics =
    usePlayerStore.getState().lyricsRequested &&
    musicData?.lyrics &&
    musicData.lyrics.trim().length > 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg">
      <div className="container max-w-4xl mx-auto px-2 py-2">
        {showLyrics && (
          <SyncedLyricsPanel
            lyrics={musicData.lyrics}
            currentTime={currentTime}
            className="mb-2"
          />
        )}
        <AudioPlayerLib
          ref={playerRef}
          src={streamUrl}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          showJumpControls={false}
          layout="horizontal"
          className="rounded-lg [&_.rhap_main-controls-button]:text-primary [&_.rhap_progress-filled]:bg-primary [&_.rhap_progress-indicator]:bg-primary"
        />
      </div>
    </div>
  );
}
