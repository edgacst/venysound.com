import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { PageTransition } from "@/components/PageTransition";
import {
  Music,
  Sparkles,
  Wand2,
  Loader2,
  Download,
  AlertCircle,
  Trash2,
  Search,
  Play,
  Globe,
  Coins,
  ChevronLeft,
  ChevronRight,
  FileText,
  Plus,
  RefreshCw,
  Disc3,
  Mic,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LOGIN_PATH } from "@/lib/site-paths";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { usePlayerStore } from "@/components/AudioPlayer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useKieCustomVoiceRegister } from "@/hooks/useKieCustomVoice";
import { createVoicePlaybackPreviewUrl } from "@/lib/voicePreviewUrl";
import { formatKieApiUserMessage, KIE_VOICE_COPYRIGHT_REJECTION_USER_MESSAGE } from "@shared/kieVoiceUserMessage";
import {
  MAX_VOICE_AUDIO_BYTES,
  readVoiceAudioFile,
  VOICE_AUDIO_INPUT_ACCEPT,
} from "@/lib/voiceAudioFile";
import { Textarea } from "@/components/ui/textarea";

/** 생성된 곡 목록 페이지당 개수 */
const SAVED_TRACKS_LIST_PAGE_SIZE = 10;

/** 장르 칩 → API/스타일 문자열(영문 위주로 모델에 전달) */
const GENRE_PRESET_IDS = [
  "kpop",
  "rnb",
  "rock",
  "hiphop",
  "uk_drill",
  "jazz",
  "classical",
  "edm",
  "ballad",
  "indie",
  "folk",
  "trot",
  "ost",
  "metal",
  "reggae",
  "soul",
  "latin",
  "ambient",
  "gospel",
  "worship_praise",
  "pop_ballad",
  "world_music",
  "cafe_music",
] as const;
type GenrePresetId = (typeof GENRE_PRESET_IDS)[number];

const GENRE_API_TOKEN: Record<GenrePresetId, string> = {
  kpop: "K-pop",
  rnb: "R&B",
  rock: "Rock",
  hiphop: "Hip-hop",
  uk_drill: "UK drill",
  jazz: "Jazz",
  classical: "Classical",
  edm: "EDM",
  ballad: "Ballad",
  indie: "Indie",
  folk: "Folk / acoustic",
  trot: "Trot",
  ost: "TV / film soundtrack",
  metal: "Metal",
  reggae: "Reggae",
  soul: "Soul",
  latin: "Latin",
  ambient: "Ambient",
  gospel: "Gospel",
  worship_praise: "Christian worship / hymn",
  pop_ballad: "Pop ballad",
  world_music: "World music",
  cafe_music: "Cafe-style mellow acoustic",
};

/** 동시에 고를 수 있는 장르 프리셋 개수(늘리려면 상수만 올리면 됨) */
const MAX_GENRE_PRESETS = 6;

/** 스타일 칩 → API 문자열 */
const STYLE_PRESET_IDS = [
  "male_vocal",
  "female_vocal",
  "duet",
  "whisper_vocal",
  "husky_voice",
  "rap_vocal",
  "falsetto_vocal",
  "soul_vocals",
  "breathy_vocal",
  "stacked_vocals",
  "piano",
  "acoustic_guitar",
  "electric_guitar",
  "fingerstyle_guitar",
  "heavy_distortion_guitar",
  "ukulele",
  "mandolin",
  "banjo",
  "violin_lead",
  "cello_solo",
  "flute_wind",
  "saxophone",
  "trumpet_lead",
  "harp",
  "hammond_organ",
  "kalimba",
  "sitar_texture",
  "music_box",
  "mallet_bells",
  "strings",
  "orchestral",
  "brass",
  "horn_section",
  "woodwind_ensemble",
  "synth",
  "analog_synth_lead",
  "fm_pluck_bells",
  "arpeggiated_synth",
  "cinematic_strings_pad",
  "atmospheric_pad",
  "bass",
  "sub_bass",
  "slap_bass_funk",
  "drums_808",
  "live_acoustic_drums",
  "electronic_percussion",
  "hand_percussion",
  "tabla_rhythm",
  "trap_roll_hi_hats",
  "four_on_floor_kick",
  "breakbeat_drums",
  "slow_tempo",
  "midtempo_groove",
  "fast_bpm_energy",
  "upbeat",
  "chill_downtempo",
  "swing_feel",
  "shuffle_groove",
  "lo_fi",
  "emotional",
  "chant",
  "tape_warmth",
  "vinyl_texture",
  "reverb_heavy_mix",
  "dry_close_mix",
  "wide_stereo_image",
  "sidechain_compression",
  "minimal_sparse",
  "layered_dense",
  "dark_atmosphere",
  "dreamy_ethereal",
  "nostalgic_tone",
  "aggressive_drive",
  "melancholic_vibe",
  "bright_major_feel",
  "glitchy_idm",
] as const;
type StylePresetId = (typeof STYLE_PRESET_IDS)[number];

const STYLE_API_TOKEN: Record<StylePresetId, string> = {
  male_vocal: "male vocal",
  female_vocal: "female vocal",
  duet: "duet vocals",
  whisper_vocal: "whisper-soft vocals",
  husky_voice: "husky voice",
  rap_vocal: "rap vocals",
  falsetto_vocal: "falsetto vocals",
  soul_vocals: "soulful lead vocals",
  breathy_vocal: "breathy intimate vocals",
  stacked_vocals: "stacked vocal harmonies",
  piano: "piano",
  acoustic_guitar: "acoustic guitar",
  electric_guitar: "electric guitar",
  fingerstyle_guitar: "fingerstyle guitar",
  heavy_distortion_guitar: "heavy distorted guitar",
  ukulele: "ukulele",
  mandolin: "mandolin",
  banjo: "banjo",
  violin_lead: "violin lead",
  cello_solo: "cello",
  flute_wind: "flute",
  saxophone: "saxophone",
  trumpet_lead: "trumpet lead",
  harp: "harp",
  hammond_organ: "Hammond organ",
  kalimba: "kalimba",
  sitar_texture: "sitar texture",
  music_box: "music box",
  mallet_bells: "mallet percussion / bells",
  strings: "strings",
  orchestral: "orchestral arrangement",
  brass: "brass section",
  horn_section: "horn section",
  woodwind_ensemble: "woodwind ensemble",
  synth: "synth",
  analog_synth_lead: "analog synth lead",
  fm_pluck_bells: "FM pluck / bell tones",
  arpeggiated_synth: "arpeggiated synth",
  cinematic_strings_pad: "cinematic string pad",
  atmospheric_pad: "atmospheric pad",
  bass: "prominent bass",
  sub_bass: "sub bass / 808 sub",
  slap_bass_funk: "slap bass",
  drums_808: "808 drums",
  live_acoustic_drums: "live acoustic drums",
  electronic_percussion: "electronic percussion",
  hand_percussion: "hand percussion",
  tabla_rhythm: "tabla rhythm",
  trap_roll_hi_hats: "trap hi-hats and rolls",
  four_on_floor_kick: "four-on-the-floor kick",
  breakbeat_drums: "breakbeat drums",
  slow_tempo: "slow tempo",
  midtempo_groove: "mid-tempo groove",
  fast_bpm_energy: "fast high-energy tempo",
  upbeat: "upbeat",
  chill_downtempo: "chill downtempo",
  swing_feel: "swing rhythm",
  shuffle_groove: "shuffle groove",
  lo_fi: "lo-fi texture",
  emotional: "emotional delivery",
  chant: "chant / choir layers",
  tape_warmth: "tape saturation warmth",
  vinyl_texture: "vinyl crackle texture",
  reverb_heavy_mix: "heavy reverb mix",
  dry_close_mix: "dry close-miked mix",
  wide_stereo_image: "wide stereo imaging",
  sidechain_compression: "pumping sidechain compression",
  minimal_sparse: "minimal sparse arrangement",
  layered_dense: "dense layered production",
  dark_atmosphere: "dark moody atmosphere",
  dreamy_ethereal: "dreamy ethereal mood",
  nostalgic_tone: "nostalgic warm tone",
  aggressive_drive: "aggressive driving energy",
  melancholic_vibe: "melancholic vibe",
  bright_major_feel: "bright uplifting major-key feel",
  glitchy_idm: "glitchy / IDM elements",
};

/** 동시에 고를 수 있는 스타일 프리셋 개수 */
const MAX_STYLE_PRESETS = 6;

/** 스튜디오 스타일 칩 빠른 선택 (Mureka형 UI) */
const STUDIO_QUICK_STYLE_IDS: (GenrePresetId | StylePresetId)[] = [
  "edm",
  "ambient",
  "piano",
  "acoustic_guitar",
  "slow_tempo",
  "uk_drill",
];

const STYLE_CHIP_FALLBACK_LABEL: Partial<Record<StylePresetId, string>> = {
  falsetto_vocal: "가성(팔세토) 보컬",
  stacked_vocals: "하모니 보컬(겹화음/다층 보컬)",
  husky_voice: "허스키 보이스",
};

/**
 * 「설명으로 생성」일 때만 사용. 가사·분위기 주제를 한글 문장으로 API 앞단에 붙임(Suno 등이 한글 설명 수용).
 * 칩 라벨은 i18n `createMusic.themeChip.*`, 값은 모델에 그대로 전달되는 스니펫.
 */
const DESCRIPTION_THEME_IDS = [
  "breakup_longing",
  "life_reflection",
  "hope_tomorrow",
  "youth_nostalgia",
  "night_city_lonely",
  "quiet_healing",
  "first_love_bittersweet",
  "family_gratitude",
  "friendship_bond",
  "solo_courage",
  "rainy_day_mood",
  "summer_freedom",
  "road_trip_wander",
  "dream_chase",
  "self_love_growth",
  "hometown_longing",
  "gentle_farewell",
  "love_confession",
  "pain_to_catharsis",
  "festive_celebration",
  "daily_respite",
  "pet_warmth",
  "starry_romance",
  "winter_cosy",
  "ocean_memory",
  "school_days",
  "reunion_joy",
  "english_lyrics",
] as const;
type DescriptionThemeId = (typeof DESCRIPTION_THEME_IDS)[number];

const DESCRIPTION_THEME_SNIPPET: Record<DescriptionThemeId, string> = {
  breakup_longing:
    "가사·분위기: 헤어진 연인에 대한 그리움. 미련과 아픔이 있지만 시간 속에서 마음을 정리해 가는 톤.",
  life_reflection: "가사·분위기: 삶의 의미·존재·일상 속 성찰. 철학적이거나 서정적으로 질문을 던지는 가사.",
  hope_tomorrow: "가사·분위기: 내일과 미래에 대한 희망. 어려움 뒤에도 다시 일어서는 긍정의 메시지.",
  youth_nostalgia: "가사·분위기: 지나온 청춘·학창 시절·추억에 대한 노스탤지어.",
  night_city_lonely: "가사·분위기: 밤의 도시, 네온과 거리, 익명 속 외로움이 공존하는 무드.",
  quiet_healing: "가사·분위기: 조용한 위로와 회복. 누군가의 어깨에 기대 쉬어 가는 듯한 따뜻함.",
  first_love_bittersweet: "가사·분위기: 첫사랑의 설렘과 아쉬움이 섞인 달콤씁쓸한 감정.",
  family_gratitude: "가사·분위기: 가족에 대한 고마움·미안함·사랑을 솔직하게 노래하는 톤.",
  friendship_bond: "가사·분위기: 친구와의 우정, 함께 웃고 버틴 시간에 대한 이야기.",
  solo_courage: "가사·분위기: 홀로 서는 용기, 독립과 자기 다짐, 혼자 걷는 길에 대한 노래.",
  rainy_day_mood: "가사·분위기: 비 오는 날 창가, 젖은 거리, 잔잔한 우울과 정화가 섞인 무드.",
  summer_freedom: "가사·분위기: 여름·바다·바람, 자유와 설렘이 느껴지는 밝은 여행감.",
  road_trip_wander: "가사·분위기: 떠남과 이동, 하이웨이와 지평선, 미지의 다음 장에 대한 기대.",
  dream_chase: "가사·분위기: 꿈과 목표를 향한 도전, 넘어져도 다시 달리는 열정.",
  self_love_growth: "가사·분위기: 나 자신을 인정하고 사랑하며 성장해 가는 과정.",
  hometown_longing: "가사·분위기: 고향·익숙한 골목·떠나온 풍경에 대한 그리움.",
  gentle_farewell: "가사·분위기: 아름다운 이별과 마무리, 미움보다는 감사로 남기는 작별.",
  love_confession: "가사·분위기: 직진 고백과 설렘, 상대에게 닿기를 바라는 마음.",
  pain_to_catharsis: "가사·분위기: 아픔을 노래로 토해 내고 가벼워지는 카타르시스.",
  festive_celebration: "가사·분위기: 축제·파티·축하, 함께 어울리는 환호와 리듬감.",
  daily_respite: "가사·분위기: 반복되는 일상 속 잠깐의 숨, 작은 쉼표와 위로.",
  pet_warmth: "가사·분위기: 반려동물·작은 동반자와의 따뜻한 순간들.",
  starry_romance: "가사·분위기: 별빛 아래 로맨스, 밤하늘과 속삭임.",
  winter_cosy: "가사·분위기: 겨울·연말, 담요와 차 한 잔 같은 포근함.",
  ocean_memory: "가사·분위기: 파도와 해변, 멀어진 기억이 물결처럼 밀려오는 감성.",
  school_days: "가사·분위기: 교실·복도·방과 후, 수험과 첫 짝사랑이 스치는 학창 시절.",
  reunion_joy: "가사·분위기: 오랜만의 재회, 반가움과 안도감이 넘치는 만남.",
  english_lyrics:
    "가사 언어: 전체 가사는 영어(English)로만 작성. 한국어·다른 언어 가사 없음. Lyrics: English only, natural phrasing.",
};

const MAX_DESCRIPTION_THEMES = 5;

function countThemeSnippetsInPrompt(text: string): number {
  let n = 0;
  for (const id of DESCRIPTION_THEME_IDS) {
    if (text.includes(DESCRIPTION_THEME_SNIPPET[id])) n += 1;
  }
  return n;
}

function removeThemeSnippetOnce(text: string, snippet: string): string {
  const i = text.indexOf(snippet);
  if (i < 0) return text;
  const next = (text.slice(0, i) + text.slice(i + snippet.length)).replace(/\n{3,}/g, "\n\n");
  return next.trim();
}

/** 주제 칩으로 넣은 스니펫만 제거(가사 직접 입력 모드 전환·초기화 시) */
function stripAllDescriptionThemeSnippets(text: string): string {
  let t = text;
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of DESCRIPTION_THEME_IDS) {
      const snip = DESCRIPTION_THEME_SNIPPET[id];
      if (t.includes(snip)) {
        t = removeThemeSnippetOnce(t, snip);
        changed = true;
      }
    }
  }
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

/** 입력란에 주제 문장을 붙임(선택된 칩이 텍스트에 보이도록) */
function appendThemeSnippetToPrompt(prompt: string, snippet: string): string {
  const p = prompt.trim();
  return p ? `${p}\n\n${snippet}` : snippet;
}

function splitCommaList(s: string): string[] {
  return s
    .split(/[,，、]/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function joinCommaUnique(parts: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.join(", ");
}

/** 필드에 들어 있는 문자열 중, 프리셋 맵 값과 동일(대소문자 무시)인 토큰 개수 */
function countPresetTokensInField(field: string, presetMap: Record<string, string>): number {
  const parts = splitCommaList(field);
  const vals = new Set(Object.values(presetMap).map((v) => v.toLowerCase()));
  return parts.filter((p) => vals.has(p.toLowerCase())).length;
}

function fieldHasPresetToken(field: string, token: string): boolean {
  const t = token.toLowerCase();
  return splitCommaList(field).some((p) => p.toLowerCase() === t);
}

/** 칩 토글: 있으면 제거, 없으면 맨 뒤에 추가(프리셋 상한 초과 시 atMax) */
function togglePresetTokenInField(
  field: string,
  token: string,
  maxPresets: number,
  presetMap: Record<string, string>,
): { next: string; atMax: boolean } {
  const parts = splitCommaList(field);
  const tLower = token.toLowerCase();
  if (parts.some((p) => p.toLowerCase() === tLower)) {
    return { next: joinCommaUnique(parts.filter((p) => p.toLowerCase() !== tLower)), atMax: false };
  }
  if (countPresetTokensInField(field, presetMap) >= maxPresets) return { next: field, atMax: true };
  return { next: joinCommaUnique([...parts, token]), atMax: false };
}

/** Suno `tags` — 커스텀의 `style`, 설명 모드 `[스타일]` 앞단. 장르·스타일(칩·직접 입력)을 합쳐 중복 제거 후 전달 */
function buildTagsForApi(genreOther: string, styleOther: string): string {
  const merged = joinCommaUnique([...splitCommaList(genreOther), ...splitCommaList(styleOther)]);
  return merged.length > 500 ? merged.slice(0, 500) : merged;
}

function orderPresetTagsForPrompt(tags: string): string {
  const parts = splitCommaList(tags);
  const weights = (p: string): number => {
    const s = p.toLowerCase();
    if (s.includes("lyrics") || s.includes("vocal") || s.includes("rap")) return 10;
    if (/(guitar|piano|violin|cello|flute|sax|trumpet|harp|organ|kalimba|sitar|strings|orchestral|brass|horn|woodwind|synth|bass|drums|percussion|808)/.test(s)) {
      return 20;
    }
    if (/(bpm|tempo|upbeat|downtempo|swing|shuffle|four-on-the-floor|breakbeat|trap)/.test(s)) return 30;
    if (/(mood|atmosphere|nostalgic|melancholic|dreamy|dark|bright|aggressive|healing|romance)/.test(s)) return 40;
    if (/(mix|reverb|stereo|sidechain|saturation|vinyl|tape|lo-fi|crackle)/.test(s)) return 50;
    return 60;
  };
  return parts
    .sort((a, b) => weights(a) - weights(b) || a.localeCompare(b))
    .join(", ");
}

function buildPresetBoostBlock(tags: string, opts: { instrumentalOnly: boolean; customMode: boolean }): string {
  const ordered = orderPresetTagsForPrompt(tags);
  if (!ordered) return "";
  if (opts.customMode) {
    return opts.instrumentalOnly
      ? `MUSICAL STYLE (important): ${ordered}\nINSTRUMENTAL ONLY`
      : `MUSICAL STYLE (important): ${ordered}`;
  }
  return `Make sure the generated music strongly matches these style keywords (important): ${ordered}`;
}

/** 외부 AI가 끝난 뒤 화면에 반영되기까지의 지연을 줄이기 위한 폴링 (생성 자체 속도는 API 한계) */
function nextAiMusicPollMs(apiState: string): number {
  if (apiState === "running" || apiState === "preview") return 1000;
  return 1600;
}
/** 로컬 캐시 키(계정별). 서버 `GET/PUT /api/ai-music/library`와 병합해 PC·모바일 동기화. */
/** React Query 키에 userId 포함 — 키를 공유하면 계정 전환 시 타인 라이브러리 캐시가 섞일 수 있음 */
function aiMusicLibraryQueryKey(userId: string | undefined) {
  return ["/api/ai-music/library", userId ?? "__none__"] as const;
}

function savedTracksStorageKey(userId: string): string {
  return `createMusic_savedTracks:${userId}`;
}

function lastAiMusicTaskSessionKey(userId: string): string {
  return `ai_music_last_task:${userId}`;
}

type TTranslate = (key: string, fallback?: string) => string;

function sanitizeFilename(name: string): string {
  const s = name.replace(/[/\\:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return s || "audio";
}

function isLikelyBadAiMusicAudioUrl(u: string): boolean {
  const s = u.trim();
  if (s.length < 12) return true;
  if (/\/None\.(mp3|wav|ogg)/i.test(s)) return true;
  if (/undefined|null/i.test(s)) return true;
  return false;
}

/** 서버 pickRemoteClipAudioUrl 과 동일 우선순위 — 임시 stream·깨진 audioUrl 로 한 곡만 나중에 무음 되는 경우 완화 */
function pickSavedTrackAudioUrl(t: Record<string, unknown>): string | undefined {
  const keys = [
    "source_audio_url",
    "source_stream_audio_url",
    "audio_url",
    "audioUrl",
    "stream_audio_url",
    "streamAudioUrl",
  ] as const;
  for (const k of keys) {
    const v = t[k];
    if (typeof v === "string") {
      const s = v.trim();
      if (s && !isLikelyBadAiMusicAudioUrl(s)) return s;
    }
  }
  for (const k of ["stream_audio_url", "streamAudioUrl", "audio_url", "audioUrl"] as const) {
    const v = t[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/** 보관함·미리듣기용 — `pickSavedTrackAudioUrl` 우선, 없으면 `audio_url` 단일값(깨진 URL 제외) */
function getSavedTrackPlayableUrl(track: SavedTrack): string | undefined {
  const picked = pickSavedTrackAudioUrl(track as Record<string, unknown>);
  if (picked && !isLikelyBadAiMusicAudioUrl(picked)) return picked;
  const u = (track.audio_url ?? "").trim();
  if (u && !isLikelyBadAiMusicAudioUrl(u)) return u;
  return undefined;
}

/** 생성 곡 재생 길이(초) → 표시용 m:ss (1시간 이상이면 h:mm:ss) */
function formatAiTrackDurationMmss(sec: number | undefined): string | null {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return null;
  let total = Math.round(sec);
  const h = Math.floor(total / 3600);
  total %= 3600;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function TrackCard({
  track,
  order,
  onRemove,
  onDownload,
  libraryDownloadAllowed,
  onScoreExport,
  scoreExportLoading,
  scorePdfEnabled,
  onPlay,
  onRequestPublish,
  isPublishing,
  isPublished,
  may2026EventFreeUi,
  studioDark = false,
  t,
}: {
  track: SavedTrack;
  order: number;
  onRemove: () => void;
  onDownload: () => void;
  /** 무료 플랜: 사이트 공개 전에는 라이브러리 파일 다운로드 불가(유료·관리자는 항상 허용) */
  libraryDownloadAllowed: boolean;
  onScoreExport: (format: "pdf" | "musicxml" | "zip") => void;
  scoreExportLoading: boolean;
  scorePdfEnabled: boolean;
  onPlay: () => void;
  /** 공개만, 또는 무료·미공개 시 공개+파일 다운로드(확인 후) */
  onRequestPublish: (opts?: { publishThenDownload?: boolean }) => void;
  isPublishing: boolean;
  isPublished: boolean;
  /** 5월 이벤트 승인+무료: '신곡으로 공개' 대신 다운로드 한 줄로 공개+저장, 옆 다운로드 링크 숨김 */
  may2026EventFreeUi?: boolean;
  studioDark?: boolean;
  t: TTranslate;
}) {
  const [showLyrics, setShowLyrics] = useState(false);
  const [showStyle, setShowStyle] = useState(false);
  const title = track.title || t("createMusic.untitled", "제목 없음");
  const durationLabel = formatAiTrackDurationMmss(track.duration);
  const isLyricsMode = track.custom_mode === true;
  const fullText = (isLyricsMode && track.original_prompt ? track.original_prompt : track.prompt || track.tags || "").trim();
  const styleDescription = (track.tags ?? "").trim() || (track.prompt ?? "").trim() || "";
  const hasDownloaded = (track.downloadCount ?? 0) > 0;
  const doneActionClass = "text-emerald-700 font-medium";
  const actionLinkClass = "text-cyan-700 hover:text-cyan-800 transition-colors";
  const publishLinkClass = "text-amber-700 hover:text-amber-800 transition-colors";
  const countBadgeClass =
    "inline-flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-emerald-500/15 text-emerald-800 text-[9px] font-bold tabular-nums leading-none";
  /** 무료·미사이트공개: 파일 받기는 이 버튼 한 번(확인 후 공개+다운로드)으로만 — 왼쪽 다운로드는 숨김 */
  const combinePublishAndDownload = !libraryDownloadAllowed && !isPublished;
  /** 이벤트 무료 회원: 재생 줄의 별도 '다운로드' 링크 숨기고, 공개/다운로드는 오른쪽 한 줄로만 */
  const showInlineDownloadLink = !combinePublishAndDownload && !may2026EventFreeUi;
  return (
    <div
      className={cn(
        "rounded-xl border p-3 flex gap-3 items-start w-full",
        studioDark
          ? "border-zinc-700/80 bg-zinc-900/90 text-zinc-100"
          : "border-slate-200 bg-white shadow-sm",
      )}
    >
      <span
        className={cn(
          "flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium",
          studioDark ? "bg-zinc-800 text-zinc-300" : "bg-slate-100 text-slate-700",
        )}
      >
        {order}
      </span>
      {track.image_url && (
        <img src={track.image_url} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 flex flex-col gap-1 pr-1">
            <p className="text-xs font-medium min-w-0 flex flex-wrap items-baseline gap-x-1.5 gap-y-0 leading-snug">
              <span className="truncate">{title}</span>
              {durationLabel ? (
                <span
                  className="text-slate-600 font-normal tabular-nums shrink-0"
                  title={t("createMusic.trackRuntimeTitle", "재생 길이")}
                >
                  {durationLabel}
                </span>
              ) : null}
            </p>
            <div
              className="flex flex-wrap gap-1 text-[10px]"
              data-testid={`track-status-${track.id}`}
              role="status"
              aria-label={t("createMusic.trackStatusAria", "다운로드·공개 상태")}
            >
              <span
                className={`inline-flex items-center rounded border px-1.5 py-0.5 font-medium tabular-nums ${
                  hasDownloaded
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                {t("createMusic.statusDownload", "다운로드")}{" "}
                {hasDownloaded ? t("createMusic.statusDone", "완료") : t("createMusic.statusPending", "대기")}
              </span>
              <span
                className={`inline-flex items-center rounded border px-1.5 py-0.5 font-medium tabular-nums ${
                  isPublished
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-900"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                {t("createMusic.statusPublish", "공개")}{" "}
                {isPublished ? t("createMusic.statusDone", "완료") : t("createMusic.statusPending", "대기")}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-600">
              <button
                type="button"
                onClick={() => setShowLyrics((v) => !v)}
                className={`inline-flex items-center gap-0.5 hover:underline ${actionLinkClass}`}
              >
                {showLyrics ? t("createMusic.hideLyrics", "가사 접기") : t("createMusic.lyricsLabel", "가사")}
              </button>
              {styleDescription && (
                <button
                  type="button"
                  onClick={() => setShowStyle((v) => !v)}
                  className={`inline-flex items-center gap-0.5 hover:underline ${actionLinkClass}`}
                >
                  {showStyle ? t("createMusic.hideStyle", "스타일 접기") : t("createMusic.styleLabel", "스타일")}
                </button>
              )}
              {track.audio_url && (
                <>
                  <button
                    type="button"
                    onClick={onPlay}
                    className={`inline-flex items-center gap-0.5 hover:underline ${actionLinkClass}`}
                    title={t("createMusic.play", "재생")}
                  >
                    <Play className="w-3 h-3" />
                    {t("createMusic.play", "재생")}
                  </button>
                  {showInlineDownloadLink ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!libraryDownloadAllowed) return;
                        onDownload();
                      }}
                      disabled={!libraryDownloadAllowed}
                      title={
                        libraryDownloadAllowed
                          ? t("createMusic.download", "다운로드")
                          : t(
                              "createMusic.libraryDownloadAfterPublishTitle",
                              "무료 플랜: 사이트에 신곡 공개 후 다운로드할 수 있습니다.",
                            )
                      }
                      className={`inline-flex items-center gap-1 hover:underline disabled:opacity-45 disabled:cursor-not-allowed disabled:no-underline ${
                        hasDownloaded ? doneActionClass : actionLinkClass
                      }`}
                    >
                      <Download className="w-3 h-3 flex-shrink-0" />
                      {t("createMusic.download", "다운로드")}
                      {typeof track.downloadCount === "number" && track.downloadCount > 0 && (
                        <span className={countBadgeClass}>{track.downloadCount}</span>
                      )}
                    </button>
                  ) : null}
                  {scorePdfEnabled && (
                    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span className="inline-flex items-center gap-0.5 text-cyan-600 dark:text-cyan-400 shrink-0" aria-hidden>
                        <FileText className="w-3 h-3" />
                        <span className="text-[11px] font-medium">{t("createMusic.scoreLabel", "악보")}</span>
                      </span>
                      <span className="text-muted-foreground/60 text-[10px] select-none" aria-hidden>
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => onScoreExport("pdf")}
                        disabled={scoreExportLoading}
                        title={t("createMusic.scorePdfTitle", "보기·인쇄용 PDF (자동 전사 초안)")}
                        className={`inline-flex items-center gap-0.5 hover:underline disabled:opacity-50 ${actionLinkClass}`}
                      >
                        {scoreExportLoading ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : null}
                        {t("createMusic.scoreFormatPdf", "PDF")}
                      </button>
                      <span className="text-muted-foreground/60 text-[10px] select-none" aria-hidden>
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => onScoreExport("musicxml")}
                        disabled={scoreExportLoading}
                        title={t(
                          "createMusic.scoreMusicxmlTitle",
                          "MuseScore 등에서 열어 수정할 수 있는 파일",
                        )}
                        className={`inline-flex items-center gap-0.5 hover:underline disabled:opacity-50 ${actionLinkClass}`}
                      >
                        {t("createMusic.scoreMusicxml", "MusicXML")}
                      </button>
                      <span className="text-muted-foreground/60 text-[10px] select-none" aria-hidden>
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => onScoreExport("zip")}
                        disabled={scoreExportLoading}
                        title={t("createMusic.scoreZipTitle", "PDF와 MusicXML을 ZIP으로 한 번에")}
                        className={`inline-flex items-center gap-0.5 hover:underline disabled:opacity-50 ${actionLinkClass}`}
                      >
                        {t("createMusic.scoreZip", "PDF+XML")}
                      </button>
                    </span>
                  )}
                  {isPublished ? (
                    may2026EventFreeUi ? (
                      libraryDownloadAllowed ? (
                        <button
                          type="button"
                          onClick={() => onDownload()}
                          title={t("createMusic.download", "다운로드")}
                          className={`inline-flex items-center gap-0.5 hover:underline ${hasDownloaded ? doneActionClass : actionLinkClass}`}
                        >
                          <Download className="w-3 h-3 flex-shrink-0" />
                          {t("createMusic.download", "다운로드")}
                          {typeof track.downloadCount === "number" && track.downloadCount > 0 && (
                            <span className={countBadgeClass}>{track.downloadCount}</span>
                          )}
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center gap-0.5 text-slate-500 text-[11px]"
                          title={t(
                            "createMusic.may2026WaitingSiblingDownloadTitle",
                            "같은 생성으로 나온 다른 곡도 사이트에 공개하면 파일을 받을 수 있습니다.",
                          )}
                        >
                          <Globe className="w-3 h-3 flex-shrink-0" />
                          {t("createMusic.may2026WaitingSiblingDownload", "형제 곡 공개 대기")}
                        </span>
                      )
                    ) : (
                      <span className={`inline-flex items-center gap-1 ${doneActionClass}`}>
                        <Globe className="w-3 h-3 flex-shrink-0" />
                        {t("createMusic.published", "공개됨")}
                        <span className={countBadgeClass} title={t("createMusic.published", "공개됨")}>
                          1
                        </span>
                      </span>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        onRequestPublish({
                          publishThenDownload: may2026EventFreeUi ? true : combinePublishAndDownload,
                        })
                      }
                      disabled={isPublishing}
                      title={
                        may2026EventFreeUi || combinePublishAndDownload
                          ? t(
                              "createMusic.downloadPublishCombinedHint",
                              "사이트에 공개한 뒤 같은 파일을 바로 저장합니다.",
                            )
                          : undefined
                      }
                      className={`inline-flex items-center gap-0.5 hover:underline disabled:opacity-50 ${
                        may2026EventFreeUi || combinePublishAndDownload ? actionLinkClass : publishLinkClass
                      }`}
                    >
                      {isPublishing ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : may2026EventFreeUi || combinePublishAndDownload ? (
                        <Download className="w-3 h-3 flex-shrink-0" />
                      ) : (
                        <Globe className="w-3 h-3" />
                      )}
                      {may2026EventFreeUi || combinePublishAndDownload
                        ? t("createMusic.download", "다운로드")
                        : t("createMusic.publishToSite", "신곡으로 공개")}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0 text-slate-500 hover:text-destructive"
            onClick={onRemove}
            title={t("createMusic.remove", "목록에서 삭제")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
        {(showLyrics || showStyle) && (
          <div className="mt-1 pt-2 border-t border-slate-200 space-y-3">
            {showStyle && styleDescription && (
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1">{t("createMusic.musicStyleLabel", "음악스타일")}</p>
                <pre className="text-xs text-slate-700 whitespace-pre-wrap break-words font-sans max-h-24 overflow-y-auto bg-slate-50 border border-slate-200 rounded p-2">
                  {styleDescription}
                </pre>
              </div>
            )}
            {showLyrics && (
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1">
                  {isLyricsMode ? t("createMusic.lyricsLabel", "가사") : t("createMusic.descriptionEnteredLabel", "입력한 음악 설명")}
                </p>
                <pre className="text-xs text-slate-700 whitespace-pre-wrap break-words font-sans max-h-40 overflow-y-auto bg-slate-50 border border-slate-200 rounded p-2">
                  {fullText || t("createMusic.noLyricsOrDescription", "저장된 가사/설명이 없습니다.")}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type CreateMode = "custom" | "description";

type GeneratedTrack = {
  clip_id?: string;
  state?: string;
  title?: string;
  tags?: string;
  prompt?: string;
  /** 사용자가 입력한 가사(커스텀 모드). API가 수정할 수 있으므로 풀가사에는 이걸 우선 표시 */
  original_prompt?: string;
  audio_url?: string;
  image_url?: string;
  duration?: number;
  custom_mode?: boolean;
};

type SavedTrack = GeneratedTrack & {
  id: string;
  createdAt: number;
  uploadCount?: number;
  downloadCount?: number;
  /** 사이트에 신곡 공개 완료 여부 (localStorage 유지) */
  publishedToSite?: boolean;
  /** `/api/ai-music/publish` 성공 시 발급된 사이트 음원 ID — 공개 후 다운로드는 로컬 업로드 파일로 받는 게 안전 */
  siteMusicId?: number;
  /** 생성 요청 task_id — 공개 시 관리자 로그와 연결 */
  generationTaskId?: string;
  generationProvider?: string;
};

/** 무료: 동일 생성 task로 묶인 클립이 2개 이상이면 모두 사이트 공개 후에만 라이브러리 파일 다운로드 */
function isFreeAiLibraryDownloadAllowed(track: SavedTrack, allTracks: SavedTrack[]): boolean {
  const tid = (track.generationTaskId ?? "").trim();
  if (!tid) return Boolean(track.publishedToSite);
  const group = allTracks.filter((x) => (x.generationTaskId ?? "").trim() === tid && Boolean((x.audio_url ?? "").trim()));
  if (group.length <= 1) return Boolean(track.publishedToSite);
  return group.every((x) => x.publishedToSite);
}

/** Suno FIRST_SUCCESS 미리듣기 — 보관함에 넣지 않고 글로벌 플레이어만 (완료 시 정식 클립으로 교체) */
function generatedPreviewToSavedTrack(tr: GeneratedTrack, taskKey: string, index: number): SavedTrack {
  const t = tr as Record<string, unknown>;
  const now = Date.now();
  return {
    ...tr,
    id: `preview-${taskKey}-${index}-${tr.clip_id ?? index}`,
    createdAt: now,
    uploadCount: 0,
    downloadCount: 0,
    audio_url: pickSavedTrackAudioUrl(t) ?? (tr.audio_url as string | undefined),
    image_url: (tr.image_url ?? t.imageUrl) as string | undefined,
    title: tr.title,
    tags: tr.tags,
    prompt: tr.prompt,
    custom_mode: tr.custom_mode,
  } as SavedTrack;
}

function parseLocalStorageRawToArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { data?: unknown[] }).data)) {
    return (parsed as { data: unknown[] }).data;
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { tracks?: unknown[] }).tracks)) {
    return (parsed as { tracks: unknown[] }).tracks;
  }
  return [];
}

function normalizeRawToSavedTracks(arr: unknown[]): SavedTrack[] {
  if (!arr.length) return [];
  return arr.map((item: unknown, i: number) => {
    const t = item as Record<string, unknown>;
    const id = typeof t.id === "string" ? t.id : `saved-${Date.now()}-${i}-${t.clip_id ?? t.id ?? i}`;
    const createdAt =
      typeof t.createdAt === "number" ? t.createdAt : typeof t.created_at === "number" ? t.created_at : Date.now();
    const uploadCount = typeof t.uploadCount === "number" ? t.uploadCount : 0;
    const downloadCount = typeof t.downloadCount === "number" ? t.downloadCount : 0;
    const siteMusicIdRaw = t.siteMusicId ?? t.site_music_id;
    const siteMusicId =
      typeof siteMusicIdRaw === "number" && Number.isFinite(siteMusicIdRaw)
        ? siteMusicIdRaw
        : typeof siteMusicIdRaw === "string" && /^\d+$/.test(siteMusicIdRaw.trim())
          ? Number(siteMusicIdRaw.trim())
          : undefined;
    const durRaw = t.duration ?? t.duration_seconds;
    let duration: number | undefined;
    if (typeof durRaw === "number" && Number.isFinite(durRaw) && durRaw > 0) duration = durRaw;
    else if (typeof durRaw === "string") {
      const n = parseFloat(durRaw.replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0) duration = n;
    }
    return {
      ...(item as object),
      id,
      createdAt,
      uploadCount,
      downloadCount,
      duration,
      generationTaskId:
        typeof t.generationTaskId === "string"
          ? t.generationTaskId
          : typeof t.generation_task_id === "string"
            ? t.generation_task_id
            : undefined,
      generationProvider:
        typeof t.generationProvider === "string"
          ? t.generationProvider
          : typeof t.generation_provider === "string"
            ? t.generation_provider
            : undefined,
      audio_url: pickSavedTrackAudioUrl(t),
      image_url: (t.image_url ?? t.imageUrl ?? t.image_large_url ?? t.imageLargeUrl) as string | undefined,
      clip_id: t.clip_id ?? t.id,
      title: t.title as string | undefined,
      tags: t.tags as string | undefined,
      prompt: t.prompt as string | undefined,
      original_prompt: (t.original_prompt ?? t.prompt) as string | undefined,
      custom_mode: Boolean(t.custom_mode),
      publishedToSite: Boolean(t.publishedToSite ?? t.published_to_site),
      ...(typeof siteMusicId === "number" && Number.isFinite(siteMusicId) ? { siteMusicId } : {}),
    } as SavedTrack;
  });
}

/** Suno 등이 비어 있는 제목 자리에 넣는 섹션 라벨 — 실제 곡명으로 쓰지 않음 */
const LYRIC_SECTION_LINE =
  /^\s*(\[[^\]]+\]|\([^)]+\)|Verse\s*\d*|V\s*\d+|CHORUS|Chorus|Bridge|Intro|Outro|Pre-Chorus|Hook|후렴|도입|간주)(\s*[:：])?\s*$/i;

function isJunkDefaultTrackTitle(s: string | undefined): boolean {
  if (s == null) return true;
  const t = s.trim();
  if (!t) return true;
  if (t.length > 64) return false;
  return LYRIC_SECTION_LINE.test(t);
}

/** 사용자 제목이 비었을 때 가사·프롬프트 본문에서 첫 유효 줄을 곡 제목 후보로 사용 */
function inferTitleFromLyricsText(text: string, maxLen = 72): string | undefined {
  const raw = (text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return undefined;
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  for (const line of lines) {
    let s = line.replace(/^\[[^\]]+\]\s*/, "").replace(/^\([^)]+\)\s*/, "").trim();
    if (!s) continue;
    if (LYRIC_SECTION_LINE.test(s)) continue;
    if (s.length < 2) continue;
    s = s.replace(/^\d+[\.)]\s*/, "").trim();
    if (!s || s.length < 2) continue;
    if (LYRIC_SECTION_LINE.test(s)) continue;
    const oneLine = s.replace(/\s+/g, " ");
    if (oneLine.length > maxLen) return `${oneLine.slice(0, maxLen - 1).trimEnd()}…`;
    return oneLine;
  }
  return undefined;
}

function resolveAiClipDisplayTitle(opts: {
  userTitle: string;
  apiTitle: string | undefined;
  lyricsOrPrompt: string;
}): string | undefined {
  const u = opts.userTitle.trim();
  if (u) return u;
  const fromLyrics = inferTitleFromLyricsText(opts.lyricsOrPrompt);
  if (fromLyrics) return fromLyrics;
  const api = opts.apiTitle?.trim();
  if (api && !isJunkDefaultTrackTitle(api)) return api;
  return undefined;
}

function mapGeneratedClipsWithResolvedTitles(
  clips: GeneratedTrack[],
  opts: { userTitle: string; customMode: boolean; submittedLyrics: string },
): GeneratedTrack[] {
  return clips.map((tr) => {
    const t = tr as Record<string, unknown>;
    const apiTitle = typeof tr.title === "string" ? tr.title : typeof t.title === "string" ? (t.title as string) : undefined;
    const promptFromClip =
      (typeof tr.prompt === "string" ? tr.prompt : "") ||
      (typeof t.prompt === "string" ? (t.prompt as string) : "") ||
      "";
    const lyricsOrPrompt = opts.customMode ? opts.submittedLyrics : promptFromClip || opts.submittedLyrics;
    const title = resolveAiClipDisplayTitle({
      userTitle: opts.userTitle,
      apiTitle,
      lyricsOrPrompt,
    });
    return { ...tr, title };
  });
}

function loadSavedTracksFromLocalStorage(userId: string): SavedTrack[] {
  try {
    const raw = localStorage.getItem(savedTracksStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return normalizeRawToSavedTracks(parseLocalStorageRawToArray(parsed));
  } catch {
    return [];
  }
}

function preferNonEmptyMediaUrl(serverVal?: string, localVal?: string): string | undefined {
  const s = (serverVal ?? "").trim();
  if (s) return serverVal;
  const l = (localVal ?? "").trim();
  if (l) return localVal;
  return serverVal ?? localVal;
}

/** 서버·로컬 합집합 — 메타는 서버 우선, URL은 보완. 공개·다운로드·업로드 카운트는 로컬/서버 중 더 진행된 값 유지 */
function mergeAiMusicLibrary(server: SavedTrack[], local: SavedTrack[]): SavedTrack[] {
  const byId = new Map<string, SavedTrack>();
  for (const t of server) {
    if (t.id) byId.set(t.id, { ...t });
  }
  for (const t of local) {
    if (!t.id) continue;
    const existing = byId.get(t.id);
    if (!existing) {
      byId.set(t.id, t);
    } else {
      const genTask =
        (existing.generationTaskId && String(existing.generationTaskId).trim()) ||
        (t.generationTaskId && String(t.generationTaskId).trim()) ||
        undefined;
      const genProv =
        (existing.generationProvider && String(existing.generationProvider).trim()) ||
        (t.generationProvider && String(t.generationProvider).trim()) ||
        undefined;
      byId.set(t.id, {
        ...existing,
        audio_url: preferNonEmptyMediaUrl(existing.audio_url, t.audio_url),
        image_url: preferNonEmptyMediaUrl(existing.image_url, t.image_url),
        uploadCount: Math.max(existing.uploadCount ?? 0, t.uploadCount ?? 0),
        downloadCount: Math.max(existing.downloadCount ?? 0, t.downloadCount ?? 0),
        publishedToSite: Boolean(existing.publishedToSite) || Boolean(t.publishedToSite),
        generationTaskId: genTask,
        generationProvider: genProv,
        duration:
          typeof existing.duration === "number" && existing.duration > 0
            ? existing.duration
            : typeof t.duration === "number" && t.duration > 0
              ? t.duration
              : undefined,
      });
    }
  }
  return Array.from(byId.values()).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

function tracksToWirePayload(tracks: SavedTrack[]) {
  return tracks.map((t) => ({
    id: t.id,
    createdAt: t.createdAt,
    clip_id: t.clip_id,
    /** undefined는 JSON에서 키가 빠져 서버 upsert가 URL을 null로 덮을 수 있음 */
    audio_url: t.audio_url ?? null,
    image_url: t.image_url ?? null,
    title: t.title,
    tags: t.tags,
    prompt: t.prompt,
    original_prompt: t.original_prompt,
    custom_mode: t.custom_mode,
    generationTaskId: t.generationTaskId,
    generationProvider: t.generationProvider,
    uploadCount: t.uploadCount,
    downloadCount: t.downloadCount,
    publishedToSite: t.publishedToSite,
    ...(typeof t.duration === "number" && Number.isFinite(t.duration) && t.duration > 0 ? { duration: t.duration } : {}),
  }));
}

export default function CreateMusic() {
  const { t, i18n } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: aiUsage } = useQuery<{
    limit: number;
    usedThisMonth: number;
    usagePeriodKey?: string;
    isPaidTier: boolean;
    walletCredits?: number;
    creditsBalance?: number;
    quota?: { kind: "songs" | "subscription_credits" | "unlimited"; used: number; limit: number };
    creditsPerMusicCreate?: number;
    wonPerMusicCreate?: number;
    deductsCreditsPerCreate?: boolean;
    /** 구독 지갑 경로: 플랜 월 공급가(원) — basic 단일이면 9000 */
    subscriptionAiPlanGrantWon?: number;
    subscriptionAiWalletRemainingWon?: number;
    /** 5월 이벤트 등 — 일반 지갑과 별도, 생성 시 우선 차감 */
    promoAiCreditsWon?: number;
    promoAiCreditsExpiresAt?: string | null;
  }>({
    queryKey: ["/api/ai-music/usage"],
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: may2026Me } = useQuery<{ application?: { status: string } | null } | null>({
    queryKey: ["/api/events/may-2026/me"],
    queryFn: async () => {
      const res = await fetch("/api/events/may-2026/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  /** 5월 이벤트 승인 + 무료 플랜: 보관함에서 '다운로드'가 공개+파일 저장 한 줄 UI */
  const may2026EventFreeUi = Boolean(
    user &&
      user.role !== "admin" &&
      (user.subscriptionTier ?? "free") === "free" &&
      may2026Me?.application?.status === "approved",
  );

  /** 페이업 PG 취소·환불이 웹훅/조회로 반영된 뒤 한도 캐시 갱신 */
  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const res = await apiRequest("POST", "/api/subscription/payup/reconcile-latest", {});
        const data = (await res.json()) as { action?: string };
        if (data?.action === "reverted") {
          void queryClient.invalidateQueries({ queryKey: ["/api/ai-music/usage"] });
          void queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
          void queryClient.invalidateQueries({ queryKey: ["/api/subscription/me"] });
        }
      } catch {
        /* PG 조회 미설정·오프라인 등 */
      }
    })();
  }, [user, queryClient]);

  const libraryHydratedForUserRef = useRef<string | null>(null);
  const librarySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 이탈·백그라운드 직전 flush용 — 디바운스 PUT이 취소돼도 서버에 최종 목록이 올라가게 함 */
  const libraryPendingSyncRef = useRef<{
    userId: string;
    payload: ReturnType<typeof tracksToWirePayload>;
    removedClientIds?: string[];
  } | null>(null);
  /** 매 렌더 최신 로그인 id — 계정 바꾼 뒤 예전 setTimeout/pagehide가 다른 계정 세션으로 PUT 하는 것 방지 */
  const sessionUserIdRef = useRef<string | undefined>(undefined);
  sessionUserIdRef.current = user?.id;

  const { data: libraryRemote, isFetched: libraryFetched } = useQuery<{ tracks?: unknown[] }>({
    queryKey: aiMusicLibraryQueryKey(user?.id),
    queryFn: async () => {
      const res = await fetch("/api/ai-music/library", { credentials: "include" });
      if (!res.ok) {
        if (res.status === 503) return { tracks: [] };
        throw new Error("library");
      }
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnMount: "always",
    retry: 1,
  });

  /** 장르 칩 → 입력란에 넣는 문자열(현재 언어 라벨, 한글 로케일이면 한글) */
  const genrePresetLabelById = useMemo(() => {
    const m = {} as Record<GenrePresetId, string>;
    for (const id of GENRE_PRESET_IDS) {
      m[id] = t(`createMusic.genreChip.${id}`, GENRE_API_TOKEN[id]);
    }
    return m;
  }, [t]);

  const genrePresetMapForToggle = useMemo((): Record<string, string> => {
    const o: Record<string, string> = {};
    for (const id of GENRE_PRESET_IDS) {
      o[id] = genrePresetLabelById[id];
    }
    return o;
  }, [genrePresetLabelById]);

  const [mode, setMode] = useState<CreateMode>("description");
  const [title, setTitle] = useState("");
  const [genreOther, setGenreOther] = useState("");
  const [styleOther, setStyleOther] = useState("");
  /** 서버 `make_instrumental` — 무보컬(연주) 생성 요청 */
  const [instrumentalOnly, setInstrumentalOnly] = useState(false);
  /** Suno/KIE `vocalGender` — 여성 f / 남성 m */
  const [vocalGender, setVocalGender] = useState<"f" | "m" | null>(null);
  /** 백엔드 보조 생성 API에 전달하는 모델 버전(sonic-*). Suno 프록시 경로는 서버가 별도 매핑합니다. */
  const [creationModelVersion, setCreationModelVersion] = useState<"sonic-v4-5" | "sonic-v5-5">("sonic-v4-5");
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "running" | "preview" | "succeeded" | "failed">("idle");
  /** Suno FIRST_SUCCESS — 최종 완료 전 커버·스트림 미리듣기 */
  const [previewTracks, setPreviewTracks] = useState<GeneratedTrack[]>([]);
  const [resultTracks, setResultTracks] = useState<GeneratedTrack[]>([]);
  const [savedTracks, setSavedTracks] = useState<SavedTrack[]>([]);
  const savedTracksRef = useRef<SavedTrack[]>([]);
  useEffect(() => {
    savedTracksRef.current = savedTracks;
  }, [savedTracks]);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [taskProvider, setTaskProvider] = useState<string | null>(null);
  const [savedTracksSearch, setSavedTracksSearch] = useState("");
  const [savedTracksListPage, setSavedTracksListPage] = useState(1);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [lyricsAssistLoading, setLyricsAssistLoading] = useState<"generate" | "optimize" | null>(null);
  const [customVoiceOpen, setCustomVoiceOpen] = useState(false);
  const [useMyVoice, setUseMyVoice] = useState(false);
  const [cvSourceBlob, setCvSourceBlob] = useState<Blob | null>(null);
  const [cvSourcePreviewUrl, setCvSourcePreviewUrl] = useState<string | null>(null);
  const [cvVerifyBlob, setCvVerifyBlob] = useState<Blob | null>(null);
  const [cvVerifyPreviewUrl, setCvVerifyPreviewUrl] = useState<string | null>(null);
  const cv = useKieCustomVoiceRegister();
  const cvSourceFileInputRef = useRef<HTMLInputElement>(null);
  const cvVerifyFileInputRef = useRef<HTMLInputElement>(null);
  const {
    state: cvRecState,
    startRecording: cvStartRecording,
    stopRecording: cvStopRecording,
    resetRecording: cvResetRecording,
  } = useVoiceRecorder();

  const { data: customVoiceData } = useQuery({
    queryKey: ["/api/ai-music/custom-voice"],
    queryFn: async () => {
      const res = await fetch("/api/ai-music/custom-voice", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        ready?: boolean;
        profile?: { voiceId: string; voiceName: string; style: string } | null;
      };
      if (!res.ok) return { ready: false, profile: null };
      return { ready: Boolean(data.ready), profile: data.profile ?? null };
    },
    enabled: !!user,
    staleTime: 30_000,
  });
  const myVoiceReady = customVoiceData?.ready === true;
  const myVoiceProfile = customVoiceData?.profile ?? null;

  const didAutoMyVoice = useRef(false);
  useEffect(() => {
    if (myVoiceReady && !didAutoMyVoice.current) {
      didAutoMyVoice.current = true;
      setUseMyVoice(true);
    }
  }, [myVoiceReady]);

  useEffect(() => {
    if (useMyVoice && creationModelVersion !== "sonic-v5-5") {
      setCreationModelVersion("sonic-v5-5");
    }
    if (useMyVoice && myVoiceReady) {
      setMode("custom");
      setInstrumentalOnly(false);
    }
  }, [useMyVoice, creationModelVersion, myVoiceReady]);
  const generationStartRef = useRef<number | null>(null);
  const submitModeRef = useRef<CreateMode>("description");
  const submittedLyricsRef = useRef<string>("");
  const submittedTitleRef = useRef<string>("");
  const submittedTagsRef = useRef<string>("");

  useEffect(() => {
    return () => {
      if (cvSourcePreviewUrl) URL.revokeObjectURL(cvSourcePreviewUrl);
      if (cvVerifyPreviewUrl) URL.revokeObjectURL(cvVerifyPreviewUrl);
    };
  }, [cvSourcePreviewUrl, cvVerifyPreviewUrl]);

  const totalDownloads = useMemo(
    () => savedTracks.reduce((sum, t) => sum + (t.downloadCount ?? 0), 0),
    [savedTracks]
  );

  const sortedFilteredSavedTracks = useMemo(() => {
    const q = savedTracksSearch.trim().toLowerCase();
    const base =
      q === ""
        ? [...savedTracks]
        : savedTracks.filter(
            (tr) =>
              (tr.title ?? "").toLowerCase().includes(q) ||
              (tr.tags ?? "").toLowerCase().includes(q) ||
              (tr.prompt ?? "").toLowerCase().includes(q) ||
              (tr.original_prompt ?? "").toLowerCase().includes(q)
          );
    return base.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [savedTracks, savedTracksSearch]);

  const savedTracksTotalPages = Math.max(
    1,
    Math.ceil(sortedFilteredSavedTracks.length / SAVED_TRACKS_LIST_PAGE_SIZE)
  );
  const savedTracksSafePage = Math.min(savedTracksListPage, savedTracksTotalPages);

  useEffect(() => {
    setSavedTracksListPage(1);
  }, [savedTracksSearch]);

  useEffect(() => {
    setSavedTracksListPage((p) => Math.min(p, savedTracksTotalPages));
  }, [savedTracksTotalPages]);

  const savedTracksPageSlice = useMemo(() => {
    const start = (savedTracksSafePage - 1) * SAVED_TRACKS_LIST_PAGE_SIZE;
    return sortedFilteredSavedTracks.slice(start, start + SAVED_TRACKS_LIST_PAGE_SIZE);
  }, [sortedFilteredSavedTracks, savedTracksSafePage]);

  useEffect(() => {
    if (status !== "pending" && status !== "running" && status !== "preview") return;
    const t = setInterval(() => {
      const start = generationStartRef.current;
      if (start) setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [status]);

  useEffect(() => {
    const flushPendingLibrary = () => {
      const p = libraryPendingSyncRef.current;
      if (!p) return;
      if (p.userId !== sessionUserIdRef.current) {
        libraryPendingSyncRef.current = null;
        return;
      }
      const body: Record<string, unknown> = { tracks: p.payload };
      if (p.removedClientIds?.length) body.removedClientIds = p.removedClientIds;
      void fetch("/api/ai-music/library", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {
        void queryClient.invalidateQueries({ queryKey: ["/api/ai-music/library"] });
      });
    };
    const onPageHide = () => {
      if (librarySyncTimerRef.current) {
        clearTimeout(librarySyncTimerRef.current);
        librarySyncTimerRef.current = null;
      }
      flushPendingLibrary();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      if (librarySyncTimerRef.current) {
        clearTimeout(librarySyncTimerRef.current);
        librarySyncTimerRef.current = null;
      }
      flushPendingLibrary();
    };
  }, []);

  useEffect(() => {
    if (librarySyncTimerRef.current) {
      clearTimeout(librarySyncTimerRef.current);
      librarySyncTimerRef.current = null;
    }
    if (!user?.id) {
      libraryHydratedForUserRef.current = null;
      libraryPendingSyncRef.current = null;
      setSavedTracks([]);
      setTaskId(null);
      setStatus("idle");
      setResultTracks([]);
      setPreviewTracks([]);
      setErrorMessage(null);
      return;
    }
    libraryHydratedForUserRef.current = null;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !libraryFetched) return;
    if (libraryHydratedForUserRef.current === user.id) return;
    libraryHydratedForUserRef.current = user.id;

    const serverTracks = normalizeRawToSavedTracks(
      Array.isArray(libraryRemote?.tracks) ? libraryRemote.tracks : [],
    );
    const localTracks = loadSavedTracksFromLocalStorage(user.id);
    const merged = mergeAiMusicLibrary(serverTracks, localTracks);
    setSavedTracks(merged);

    const payload = tracksToWirePayload(merged);
    try {
      localStorage.setItem(savedTracksStorageKey(user.id), JSON.stringify(payload));
    } catch {}
    queryClient.setQueryData(aiMusicLibraryQueryKey(user.id), { tracks: payload });

    const serverIds = new Set(serverTracks.map((t) => t.id));
    const needsPush =
      (serverTracks.length === 0 && localTracks.length > 0) ||
      localTracks.some((t) => Boolean(t.id) && !serverIds.has(t.id)) ||
      merged.length !== serverTracks.length;

    if (needsPush) {
      void fetch("/api/ai-music/library", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracks: payload }),
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/ai-music/library"] }))
        .catch(() => {
          setErrorMessage("서버 동기화에 실패했습니다. 네트워크 상태를 확인해 주세요.");
          queryClient.invalidateQueries({ queryKey: ["/api/ai-music/library"] });
        });
    }
  }, [user?.id, libraryFetched, libraryRemote, queryClient]);

  const persistTracks = useCallback(
    (
      tracks: SavedTrack[],
      opts?: { immediate?: boolean; removedClientIds?: string[] },
    ): Promise<void> | undefined => {
      const uid = user?.id;
      if (!uid) return undefined;
      const payload = tracksToWirePayload(tracks);
      const removedClientIds = opts?.removedClientIds?.length ? [...opts.removedClientIds] : undefined;
      libraryPendingSyncRef.current = { userId: uid, payload, removedClientIds };
      try {
        localStorage.setItem(savedTracksStorageKey(uid), JSON.stringify(payload));
      } catch {}
      queryClient.setQueryData(aiMusicLibraryQueryKey(uid), { tracks: payload });
      if (librarySyncTimerRef.current) clearTimeout(librarySyncTimerRef.current);
      const send = (): Promise<void> => {
        librarySyncTimerRef.current = null;
        if (uid !== sessionUserIdRef.current) return Promise.resolve();
        const body: Record<string, unknown> = { tracks: payload };
        if (removedClientIds?.length) body.removedClientIds = removedClientIds;
        return fetch("/api/ai-music/library", {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
          .then((res) => {
            if (!res.ok) throw new Error(`library PUT ${res.status}`);
            return queryClient.invalidateQueries({ queryKey: ["/api/ai-music/library"] });
          })
          .catch(() => {
            setErrorMessage("서버 동기화에 실패했습니다. 네트워크 상태를 확인해 주세요.");
            queryClient.invalidateQueries({ queryKey: ["/api/ai-music/library"] });
          });
      };
      if (opts?.immediate) {
        return send();
      }
      librarySyncTimerRef.current = setTimeout(() => void send(), 850);
      return undefined;
    },
    [user?.id, queryClient],
  );

  const removeSavedTrack = useCallback(
    (id: string) => {
      setSavedTracks((prev) => {
        const next = prev.filter((t) => t.id !== id);
        persistTracks(next, { immediate: true, removedClientIds: [id] });
        return next;
      });
    },
    [persistTracks]
  );

  // ── 신곡 공개 ──
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [publishConfirm, setPublishConfirm] = useState<{
    track: SavedTrack;
    publishThenDownload: boolean;
  } | null>(null);

  const handlePublishTrack = useCallback(
    async (track: SavedTrack, opts?: { chainSiblings?: boolean }): Promise<boolean> => {
      if (!track.audio_url) return false;
      setPublishingId(track.id);
      const publishBody = (t: SavedTrack) =>
        JSON.stringify({
          audioUrl: t.audio_url,
          imageUrl: t.image_url,
          title: t.title,
          tags: t.tags,
          prompt: t.original_prompt ?? t.prompt,
          taskId: t.generationTaskId,
          clipId: typeof t.clip_id === "string" ? t.clip_id : t.clip_id != null ? String(t.clip_id) : undefined,
          generationProvider: t.generationProvider,
        });
      const publishOne = async (t: SavedTrack, nextRows: SavedTrack[]): Promise<boolean> => {
        const res = await fetch("/api/ai-music/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: publishBody(t),
        });
        const data = await res.json();
        if (!res.ok) {
          toast({
            title: "공개 실패",
            description: data.message || "오류가 발생했습니다.",
            variant: "destructive",
          });
          return false;
        }
        const idx = nextRows.findIndex((row) => row.id === t.id);
        const midRaw = (data as { music?: { id?: unknown } }).music?.id;
        const siteMusicId =
          typeof midRaw === "number" && Number.isFinite(midRaw)
            ? midRaw
            : typeof midRaw === "string" && /^\d+$/.test(midRaw.trim())
              ? Number(midRaw.trim())
              : undefined;
        if (idx >= 0) {
          nextRows[idx] = {
            ...nextRows[idx],
            publishedToSite: true,
            ...(typeof siteMusicId === "number" && Number.isFinite(siteMusicId) ? { siteMusicId } : {}),
          };
        }
        return true;
      };
      try {
        let next = [...savedTracksRef.current];
        if (!(await publishOne(track, next))) return false;
        let publishedCount = 1;
        if (opts?.chainSiblings) {
          const tid = (track.generationTaskId ?? "").trim();
          if (tid) {
            const peers = next.filter(
              (x) =>
                x.id !== track.id &&
                (x.generationTaskId ?? "").trim() === tid &&
                !x.publishedToSite &&
                Boolean((x.audio_url ?? "").trim()),
            );
            for (const p of peers) {
              if (!(await publishOne(p, next))) return false;
              publishedCount += 1;
            }
          }
        }
        if (opts?.chainSiblings && publishedCount > 1) {
          toast({
            title: "신곡으로 공개되었습니다!",
            description: `같은 생성분 ${publishedCount}곡이 모두 사이트에 공개되었습니다. AI 생성 배지가 표시됩니다.`,
          });
        } else {
          toast({
            title: "신곡으로 공개되었습니다!",
            description: `"${track.title || "AI 생성 음악"}"이(가) 사이트에 공개되었습니다. AI 생성 배지가 표시됩니다.`,
          });
        }
        savedTracksRef.current = next;
        setSavedTracks(next);
        /** 무료·이벤트: audio-proxy가 DB 라이브러리 published 플래그를 보므로, 공개 직후 다운로드 전에 PUT 완료를 기다림 */
        const syncLib = persistTracks(next, { immediate: true });
        if (syncLib) await syncLib;
        return true;
      } catch {
        toast({ title: "공개 실패", description: "네트워크 오류가 발생했습니다.", variant: "destructive" });
        return false;
      } finally {
        setPublishingId(null);
      }
    },
    [toast, persistTracks],
  );

  const playTrackInGlobalPlayer = useCallback((track: SavedTrack) => {
    const url = getSavedTrackPlayableUrl(track);
    if (!url) return;
    usePlayerStore.getState().playExternalTrack({
      url,
      title: track.title || "제목 없음",
      artist: track.tags,
      imageUrl: track.image_url,
    });
  }, []);

  const handleDownloadTrack = useCallback(
    async (track: SavedTrack) => {
    /** 5월 이벤트 승인·무료: 다운로드만 눌러도 반드시 사이트 배포(같은 생성분 형제까지) 선행 */
    if (may2026EventFreeUi && track.audio_url) {
      const tid = (track.generationTaskId ?? "").trim();
      const snap0 = savedTracksRef.current;
      if (tid) {
        const lead = snap0.find(
          (x) =>
            (x.generationTaskId ?? "").trim() === tid &&
            Boolean((x.audio_url ?? "").trim()) &&
            !x.publishedToSite,
        );
        if (lead) {
          const ok = await handlePublishTrack(lead, { chainSiblings: true });
          if (!ok) return;
        }
      } else if (!track.publishedToSite) {
        const ok = await handlePublishTrack(track, { chainSiblings: true });
        if (!ok) return;
      }
    }
    const effective = savedTracksRef.current.find((x) => x.id === track.id) ?? track;
    const paidOrPublished = Boolean(
      aiUsage?.isPaidTier || isFreeAiLibraryDownloadAllowed(effective, savedTracksRef.current),
    );
    if (!paidOrPublished) {
      toast({
        title: t("createMusic.libraryDownloadBlockedTitle", "다운로드 전에 공개해 주세요"),
        description: t(
          "createMusic.libraryDownloadAfterPublishBody",
          "무료 플랜에서는 생성한 곡을 사이트에 신곡으로 공개한 뒤에만 파일을 내려받을 수 있습니다. 유료 플랜·관리자는 공개 전에도 다운로드할 수 있습니다.",
        ),
        variant: "destructive",
      });
      return;
    }
    if (!effective.audio_url) return;
    const baseName = sanitizeFilename(effective.title || "제목 없음");
    try {
      /** 공개 후에는 원격 생성 URL이 만료될 수 있어, 가능하면 사이트 음원(로컬 업로드) 기준으로 내려받습니다. */
      const siteMusicId =
        typeof effective.siteMusicId === "number" && Number.isFinite(effective.siteMusicId)
          ? effective.siteMusicId
          : undefined;
      if (siteMusicId != null) {
        const res = await fetch(`/api/music/${siteMusicId}/download`, { credentials: "include" });
        if (!res.ok) {
          const statusLine = `${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
          const raw = await res.text().catch(() => "");
          let msg = "";
          const trimmed = raw.trim();
          if (trimmed) {
            try {
              const j = JSON.parse(trimmed) as { message?: string; error?: string; msg?: string };
              msg = String(j.message || j.error || j.msg || "").trim();
            } catch {
              msg = trimmed.replace(/\s+/g, " ").slice(0, 280);
            }
          }
          if (!msg) msg = `서버 응답 오류 (${statusLine}). 잠시 후 다시 시도해 주세요.`;
          toast({ title: "다운로드 실패", description: msg, variant: "destructive" });
          return;
        }
        const blob = await res.blob();
        const cd = res.headers.get("content-disposition") || "";
        const m = /filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i.exec(cd);
        const headerName = decodeURIComponent((m?.[1] || m?.[2] || "").trim());
        const fallbackExt = blob.type.includes("ogg") ? ".ogg" : blob.type.includes("wav") ? ".wav" : ".mp3";
        const extFromHeader = (() => {
          const n = headerName.toLowerCase();
          if (n.endsWith(".ogg")) return ".ogg";
          if (n.endsWith(".wav")) return ".wav";
          if (n.endsWith(".mp3")) return ".mp3";
          return "";
        })();
        const fileName =
          headerName && extFromHeader
            ? headerName
            : `${baseName}${extFromHeader || fallbackExt}`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const proxyUrl = `/api/ai-music/audio-proxy?url=${encodeURIComponent(effective.audio_url)}&purpose=file`;
        const res = await fetch(proxyUrl, { credentials: "include" });
        if (!res.ok) {
          const statusLine = `${res.status}${res.statusText ? ` ${res.statusText}` : ""}`;
          const raw = await res.text().catch(() => "");
          let msg = "";
          const trimmed = raw.trim();
          if (trimmed) {
            try {
              const j = JSON.parse(trimmed) as { message?: string; error?: string; msg?: string };
              msg = String(j.message || j.error || j.msg || "").trim();
            } catch {
              msg = trimmed.replace(/\s+/g, " ").slice(0, 280);
            }
          }
          if (!msg) {
            msg = `서버 응답 오류 (${statusLine}). 잠시 후 다시 시도해 주세요.`;
          }
          toast({ title: "다운로드 실패", description: msg, variant: "destructive" });
          return;
        }
        const blob = await res.blob();
        const type = blob.type || "audio/mpeg";
        const ext = type.includes("ogg") ? ".ogg" : type.includes("wav") ? ".wav" : ".mp3";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${baseName}${ext}`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setSavedTracks((prev) => {
        const next = prev.map((t) =>
          t.id === effective.id ? { ...t, downloadCount: (t.downloadCount ?? 0) + 1 } : t,
        );
        persistTracks(next, { immediate: true });
        return next;
      });
    } catch (e) {
      const hint =
        e instanceof Error && e.message
          ? `${e.message} (네트워크·연결 시간 초과·브라우저 제한일 수 있습니다.)`
          : "네트워크 오류가 발생했습니다.";
      toast({
        title: "다운로드 실패",
        description: hint,
        variant: "destructive",
      });
    }
  },
    [persistTracks, aiUsage?.isPaidTier, toast, t, may2026EventFreeUi, handlePublishTrack],
  );

  const [scorePdfEnabled, setScorePdfEnabled] = useState(false);
  const [scorePdfTrackId, setScorePdfTrackId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setScorePdfEnabled(false);
      return;
    }
    let cancelled = false;
    void fetch("/api/ai-music/score-pdf/availability", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => {
        if (!cancelled) setScorePdfEnabled(!!d.enabled);
      })
      .catch(() => {
        if (!cancelled) setScorePdfEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleScoreExport = useCallback(
    async (track: SavedTrack, format: "pdf" | "musicxml" | "zip") => {
      if (!track.audio_url) return;
      setScorePdfTrackId(track.id);
      toast({
        title: t("createMusic.scoreExportStarting", "악보 파일 생성 중…"),
        description: t("createMusic.scorePdfWait", "서버에서 전사·조판하므로 1~3분 걸릴 수 있습니다."),
      });
      const baseName = sanitizeFilename(track.title || "score");
      const expectCt =
        format === "pdf"
          ? (ct: string) => ct.includes("pdf")
          : format === "musicxml"
            ? (ct: string) => ct.includes("xml") || ct.includes("musicxml")
            : (ct: string) => ct.includes("zip");
      const ext = format === "pdf" ? "pdf" : format === "musicxml" ? "musicxml" : "zip";
      const doneTitle =
        format === "pdf"
          ? t("createMusic.scorePdfDone", "PDF를 저장했습니다.")
          : format === "musicxml"
            ? t("createMusic.scoreMusicxmlDone", "MusicXML을 저장했습니다.")
            : t("createMusic.scoreZipDone", "ZIP을 저장했습니다.");
      try {
        const res = await fetch("/api/ai-music/score-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ clientId: track.id, format }),
        });
        const ct = res.headers.get("content-type") || "";
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { message?: string; detail?: string };
          const desc =
            [data.message, data.detail].filter(Boolean).join(" — ").trim() || `HTTP ${res.status}`;
          toast({
            title: t("createMusic.scoreExportFailed", "악보내기 실패"),
            description: desc.slice(0, 1200),
            variant: "destructive",
          });
          return;
        }
        if (!expectCt(ct)) {
          toast({
            title: t("createMusic.scoreExportFailed", "악보내기 실패"),
            description: t("createMusic.scorePdfBadResponse", "응답 형식이 올바르지 않습니다."),
            variant: "destructive",
          });
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${baseName}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: doneTitle });
      } catch {
        toast({
          title: t("createMusic.scoreExportFailed", "악보내기 실패"),
          description: t("createMusic.networkErrorGeneric", "네트워크 오류가 발생했습니다."),
          variant: "destructive",
        });
      } finally {
        setScorePdfTrackId(null);
      }
    },
    [t, toast],
  );

  const pollTask = useCallback(
    async (tid: string, provider?: string) => {
      const q = provider ? `?provider=${encodeURIComponent(provider)}` : "";
      const res = await fetch(`/api/ai-music/task/${tid}${q}`, { credentials: "include" });
      if (!res.ok) {
        setPreviewTracks([]);
        setStatus("failed");
        setErrorMessage("작업 조회에 실패했습니다.");
        return;
      }
      const data = await res.json();
      const state = data.state ?? "pending";
      setStatus(state);
      if (state === "preview" && Array.isArray(data.data)) {
        const userTitle = submittedTitleRef.current.trim();
        const customMode = submitModeRef.current === "custom";
        setPreviewTracks(
          mapGeneratedClipsWithResolvedTitles(data.data as GeneratedTrack[], {
            userTitle,
            customMode,
            submittedLyrics: submittedLyricsRef.current,
          }),
        );
      }
      if (state === "succeeded" && Array.isArray(data.data)) {
        generationStartRef.current = null;
        setPreviewTracks([]);
        const userTitle = submittedTitleRef.current.trim();
        const customMode = submitModeRef.current === "custom";
        const resolvedClips = mapGeneratedClipsWithResolvedTitles(data.data as GeneratedTrack[], {
          userTitle,
          customMode,
          submittedLyrics: submittedLyricsRef.current,
        });
        const billing = (data as {
          billing?: { applied?: boolean; won_charged?: number; promo_tracks_deducted?: number; credits_balance?: number };
        }).billing;
        if (billing?.applied) {
          queryClient.invalidateQueries({ queryKey: ["/api/ai-music/usage"] });
          queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
          queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          const bal = billing.credits_balance;
          if (typeof bal === "number" && Number.isFinite(bal) && bal >= 0) {
            queryClient.setQueryData(["/api/credits"], { credits: bal, balanceWon: bal });
            queryClient.setQueryData(["/api/ai-music/usage"], (prev: Record<string, unknown> | undefined) =>
              prev && typeof prev === "object"
                ? { ...prev, creditsBalance: bal, walletCredits: bal }
                : prev,
            );
          }
          const promoTracks = Number(billing.promo_tracks_deducted) || 0;
          const won = Number(billing.won_charged) || 0;
          if (promoTracks > 0) {
            toast({
              title: t("createMusic.toastPromoTracksTitle", "무료 곡 차감"),
              description: t("createMusic.toastPromoTracksBody", "이번 생성 완료로 이벤트 무료 AI 곡 {{n}}곡분이 차감되었습니다.", {
                n: promoTracks.toLocaleString(),
              }),
            });
          } else if (won > 0) {
            toast({
              title: t("createMusic.toastWonDeductTitle", "차감 안내"),
              description:
                typeof bal === "number" && Number.isFinite(bal) && bal >= 0
                  ? t("createMusic.toastWonDeductWithBalance", "{{n}}원이 차감되었습니다. 지갑 잔액 {{bal}}원", {
                      n: won.toLocaleString(),
                      bal: bal.toLocaleString(),
                    })
                  : t("createMusic.toastWonDeduct", "{{n}}원이 차감되었습니다.", { n: won.toLocaleString() }),
            });
          }
        }
        setResultTracks(resolvedClips);
        setTaskId(null);
        const now = Date.now();
        const userTags = submittedTagsRef.current.trim();
        const genTaskId = tid;
        const genProvider = provider ?? undefined;
        const toSave: SavedTrack[] = resolvedClips.map((tr, i) => {
          const t = tr as Record<string, unknown>;
          return {
            ...tr,
            tags: userTags ? userTags : (tr.tags ?? (t.tags as string | undefined)),
            audio_url: pickSavedTrackAudioUrl(t) ?? (tr.audio_url as string | undefined),
            image_url: (tr.image_url ?? t.imageUrl) as string | undefined,
            id: `saved-${now}-${i}-${tr.clip_id ?? i}`,
            createdAt: now,
            custom_mode: tr.custom_mode ?? customMode,
            original_prompt: customMode ? submittedLyricsRef.current : undefined,
            uploadCount: 0,
            downloadCount: 0,
            generationTaskId: genTaskId,
            generationProvider: genProvider,
          };
        });
        setSavedTracks((prev) => {
          const next = [...toSave, ...prev];
          persistTracks(next, { immediate: true });
          return next;
        });
        void fetch("/api/ai-music/publish-nudge", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: tid }),
        })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
          })
          .catch(() => {});
      }
      if (state === "failed") {
        generationStartRef.current = null;
        setPreviewTracks([]);
        setErrorMessage(formatKieApiUserMessage(data.message, { creditsProvider: "suno" }) || "생성에 실패했습니다.");
        setTaskId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/ai-music/usage"] });
        queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
        queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
      }
      if (state === "pending" || state === "running" || state === "preview") {
        setTimeout(() => pollTask(tid, provider), nextAiMusicPollMs(state));
      }
    },
    [persistTracks, queryClient, toast, t]
  );


  const resetCvDrafts = useCallback(() => {
    if (cvSourcePreviewUrl) URL.revokeObjectURL(cvSourcePreviewUrl);
    if (cvVerifyPreviewUrl) URL.revokeObjectURL(cvVerifyPreviewUrl);
    setCvSourceBlob(null);
    setCvSourcePreviewUrl(null);
    setCvVerifyBlob(null);
    setCvVerifyPreviewUrl(null);
    cvResetRecording();
    cv.reset();
  }, [cv, cvResetRecording, cvSourcePreviewUrl, cvVerifyPreviewUrl]);

  const applyCvRecordingPreview = useCallback(
    async (blob: Blob, step: "source" | "verify"): Promise<boolean> => {
      if (!blob.size) {
        toast({
          title: t("createMusic.voiceRecordEmpty", "녹음이 비어 있습니다."),
          variant: "destructive",
        });
        return false;
      }

      if (step === "source") {
        if (cvSourcePreviewUrl) URL.revokeObjectURL(cvSourcePreviewUrl);
        setCvSourceBlob(blob);
        setCvSourcePreviewUrl(null);
      } else {
        if (cvVerifyPreviewUrl) URL.revokeObjectURL(cvVerifyPreviewUrl);
        setCvVerifyBlob(blob);
        setCvVerifyPreviewUrl(null);
      }

      try {
        const previewUrl = await createVoicePlaybackPreviewUrl(blob);
        if (step === "source") setCvSourcePreviewUrl(previewUrl);
        else setCvVerifyPreviewUrl(previewUrl);
      } catch {
        toast({
          title: t("createMusic.voiceRecordPreviewFailed", "미리듣기만 실패했습니다. 파일은 선택되었으니 「다음」으로 진행할 수 있습니다."),
          variant: "destructive",
        });
      }
      return true;
    },
    [cvSourcePreviewUrl, cvVerifyPreviewUrl, toast, t],
  );

  const clearCvSourcePreview = useCallback(() => {
    if (cvSourcePreviewUrl) URL.revokeObjectURL(cvSourcePreviewUrl);
    setCvSourcePreviewUrl(null);
    setCvSourceBlob(null);
  }, [cvSourcePreviewUrl]);

  const clearCvVerifyPreview = useCallback(() => {
    if (cvVerifyPreviewUrl) URL.revokeObjectURL(cvVerifyPreviewUrl);
    setCvVerifyPreviewUrl(null);
    setCvVerifyBlob(null);
  }, [cvVerifyPreviewUrl]);

  const handleCvRecordStop = useCallback(async () => {
    try {
      const blob = await cvStopRecording();
      if (cv.step === "source") await applyCvRecordingPreview(blob, "source");
      else if (cv.step === "verify") await applyCvRecordingPreview(blob, "verify");
    } catch {
      toast({ title: t("createMusic.voiceRecordMicDenied", "마이크 권한이 필요합니다."), variant: "destructive" });
    }
  }, [cv.step, cvStopRecording, applyCvRecordingPreview, toast, t]);

  const handleCvAudioUpload = useCallback(
    async (step: "source" | "verify", file: File | null | undefined) => {
      if (!file) return;
      try {
        const blob = await readVoiceAudioFile(file);
        if (cvRecState === "recording") cvResetRecording();
        if (step === "source") clearCvSourcePreview();
        else clearCvVerifyPreview();
        const ok = await applyCvRecordingPreview(blob, step);
        if (!ok) return;
        toast({ title: t("createMusic.voiceUploadDone", "오디오 파일을 불러왔습니다.") });
      } catch (e) {
        const code = e instanceof Error ? e.message : "";
        const title =
          code === "UNSUPPORTED_TYPE"
            ? t("createMusic.voiceUploadUnsupported", "mp3, wav, webm, m4a, ogg 등 오디오 파일만 업로드할 수 있습니다.")
            : code === "TOO_LARGE"
              ? t("createMusic.voiceUploadTooLarge", "파일 크기는 8MB 이하여야 합니다.")
              : code === "EMPTY"
                ? t("createMusic.voiceRecordEmpty", "녹음이 비어 있습니다.")
                : t("createMusic.voiceUploadFailed", "오디오 파일을 불러오지 못했습니다.");
        toast({ title, variant: "destructive" });
      }
    },
    [
      applyCvRecordingPreview,
      clearCvSourcePreview,
      clearCvVerifyPreview,
      cvRecState,
      cvResetRecording,
      toast,
      t,
    ],
  );

  const renderCvAudioCapture = useCallback(
    (step: "source" | "verify") => {
      const fileInputRef = step === "source" ? cvSourceFileInputRef : cvVerifyFileInputRef;
      const previewUrl = step === "source" ? cvSourcePreviewUrl : cvVerifyPreviewUrl;
      const audioBlob = step === "source" ? cvSourceBlob : cvVerifyBlob;
      const clearPreview = step === "source" ? clearCvSourcePreview : clearCvVerifyPreview;
      const recordingBlocked = cvRecState === "recording";

      return (
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept={VOICE_AUDIO_INPUT_ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              void handleCvAudioUpload(step, f);
              e.target.value = "";
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {recordingBlocked ? (
              <Button type="button" variant="destructive" className="gap-2" onClick={() => void handleCvRecordStop()}>
                <span className="h-2 w-2 rounded-full bg-white animate-pulse" /> {t("createMusic.voiceRecordStop", "녹음 중지")}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={cv.busy}
                  onClick={() => {
                    clearPreview();
                    cvResetRecording();
                    void cvStartRecording().catch(() =>
                      toast({ title: t("createMusic.voiceRecordMicDenied", "마이크 권한이 필요합니다."), variant: "destructive" }),
                    );
                  }}
                >
                  <Mic className="h-4 w-4" /> {t("createMusic.voiceRecordStart", "녹음 시작")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={cv.busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {t("createMusic.voiceUploadBtn", "오디오 업로드")}
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "createMusic.voiceUploadHint",
              "mp3·wav·webm·m4a·ogg, 최대 {{mb}}MB. 업로드 후 재생으로 확인하세요.",
              { mb: Math.round(MAX_VOICE_AUDIO_BYTES / (1024 * 1024)) },
            )}
          </p>
          {previewUrl ? (
            <audio key={previewUrl} src={previewUrl} controls playsInline preload="auto" className="w-full rounded-lg" />
          ) : audioBlob ? (
            <p className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              {t("createMusic.voiceUploadSelected", "오디오 선택됨")} ({Math.max(1, Math.round(audioBlob.size / 1024))} KB)
              {" — "}
              {t("createMusic.voiceUploadSelectedHint", "미리듣기가 안 되어도 「다음」으로 진행할 수 있습니다.")}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("createMusic.voiceRecordPreviewHint", "녹음 또는 업로드 후 여기서 들을 수 있습니다.")}
            </p>
          )}
        </div>
      );
    },
    [
      clearCvSourcePreview,
      clearCvVerifyPreview,
      cv.busy,
      cvRecState,
      cvResetRecording,
      cvSourceBlob,
      cvSourcePreviewUrl,
      cvStartRecording,
      cvVerifyBlob,
      cvVerifyPreviewUrl,
      handleCvAudioUpload,
      handleCvRecordStop,
      toast,
      t,
    ],
  );

  const handleStudioGenerateLyrics = useCallback(async () => {
    if (!user) return;
    const promptTrim = prompt.trim();
    const mergedTags = buildTagsForApi(genreOther, styleOther);
    if (!promptTrim && !mergedTags) {
      toast({
        title: t("createMusic.lyricsGenerateNeedInput", "주제·설명 또는 장르·스타일을 입력해 주세요."),
        variant: "destructive",
      });
      return;
    }
    setLyricsAssistLoading("generate");
    try {
      const res = await fetch("/api/ai-music/lyrics/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          prompt: promptTrim,
          tags: mergedTags || undefined,
          language: i18n.language,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        lyrics?: string;
        title?: string;
        variations?: { text?: string; title?: string }[];
      };
      if (!res.ok) {
        toast({ title: data.message ?? t("createMusic.lyricsGenerateFailed", "가사 생성에 실패했습니다."), variant: "destructive" });
        return;
      }
      const text = typeof data.lyrics === "string" ? data.lyrics.trim() : "";
      if (!text) {
        toast({ title: t("createMusic.lyricsGenerateEmpty", "생성된 가사가 없습니다."), variant: "destructive" });
        return;
      }
      setPrompt(text);
      if (typeof data.title === "string" && data.title.trim() && !title.trim()) {
        setTitle(data.title.trim().slice(0, 50));
      }
      const n = Array.isArray(data.variations) ? data.variations.length : 1;
      toast({
        title: t("createMusic.lyricsGenerateDone", "가사가 생성되었습니다"),
        description:
          n > 1
            ? t("createMusic.lyricsGenerateVariants", "여러 버전 중 첫 번째를 적용했습니다. 다시 생성하면 다른 버전을 받을 수 있습니다.")
            : undefined,
      });
    } catch (err) {
      const isNetwork = err instanceof TypeError && /fetch|network|Failed/i.test(String(err));
      toast({
        title: isNetwork
          ? t("login.serverErrorDesc", "서버에 연결할 수 없습니다.")
          : t("createMusic.lyricsGenerateFailed", "가사 생성에 실패했습니다."),
        description: isNetwork ? t("createMusic.devServerHint", "npm run dev 실행 후 http://127.0.0.1:5000 에 접속해 주세요.") : undefined,
        variant: "destructive",
      });
    } finally {
      setLyricsAssistLoading(null);
    }
  }, [user, prompt, genreOther, styleOther, title, toast, t, i18n.language]);

  const handleStudioOptimizeLyrics = useCallback(async () => {
    if (!user) return;
    const promptTrim = prompt.trim();
    if (!promptTrim) {
      toast({
        title: t("createMusic.lyricsOptimizeNeedInput", "최적화할 가사를 입력해 주세요."),
        variant: "destructive",
      });
      return;
    }
    setLyricsAssistLoading("optimize");
    try {
      const res = await fetch("/api/ai-music/lyrics/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lyrics: promptTrim,
          tags: buildTagsForApi(genreOther, styleOther) || undefined,
          language: i18n.language,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; lyrics?: string; title?: string };
      if (!res.ok) {
        toast({ title: data.message ?? t("createMusic.lyricsOptimizeFailed", "가사 최적화에 실패했습니다."), variant: "destructive" });
        return;
      }
      const text = typeof data.lyrics === "string" ? data.lyrics.trim() : "";
      if (!text) {
        toast({ title: t("createMusic.lyricsOptimizeEmpty", "최적화 결과가 없습니다."), variant: "destructive" });
        return;
      }
      setPrompt(text);
      if (typeof data.title === "string" && data.title.trim() && !title.trim()) {
        setTitle(data.title.trim().slice(0, 50));
      }
      toast({ title: t("createMusic.lyricsOptimizeDone", "가사가 최적화되었습니다") });
    } catch (err) {
      const isNetwork = err instanceof TypeError && /fetch|network|Failed/i.test(String(err));
      toast({
        title: isNetwork
          ? t("login.serverErrorDesc", "서버에 연결할 수 없습니다.")
          : t("createMusic.lyricsOptimizeFailed", "가사 최적화에 실패했습니다."),
        description: isNetwork ? t("createMusic.devServerHint", "npm run dev 실행 후 http://127.0.0.1:5000 에 접속해 주세요.") : undefined,
        variant: "destructive",
      });
    } finally {
      setLyricsAssistLoading(null);
    }
  }, [user, prompt, genreOther, styleOther, title, toast, t, i18n.language]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const promptTrim = prompt.trim();
    const customMode = mode === "custom";
    if (mode === "custom" && !promptTrim && !instrumentalOnly) {
      toast({ title: "가사를 입력해 주세요.", variant: "destructive" });
      return;
    }
    if (mode === "description" && !promptTrim) {
      toast({
        title: t(
          "createMusic.descriptionOrThemeRequired",
          "음악 설명을 적거나, 주제 칩을 눌러 입력란에 문장을 넣어 주세요.",
        ),
        variant: "destructive",
      });
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setResultTracks([]);
    setPreviewTracks([]);
    setStatus("pending");
    setElapsedSec(0);
    generationStartRef.current = Date.now();
    submitModeRef.current = mode;
    /** 커스텀·설명 공통: 제목 비움 시 가사/설명에서 제목 추론용 */
    submittedLyricsRef.current = promptTrim;
    submittedTitleRef.current = title.trim();
    const mergedTags = buildTagsForApi(genreOther, styleOther);
    submittedTagsRef.current = mergedTags;
    try {
      const presetBoost = buildPresetBoostBlock(mergedTags, { instrumentalOnly, customMode });
      const boostedPrompt =
        customMode && !instrumentalOnly
          ? presetBoost
            ? `${presetBoost}\n\nLYRICS:\n${promptTrim}`
            : promptTrim
          : presetBoost
            ? `${presetBoost}\n\n${promptTrim}`
            : promptTrim;
      const body: Record<string, unknown> = {
        custom_mode: customMode,
        mv: creationModelVersion,
        title: title.trim() || undefined,
        tags: mergedTags || undefined,
      };
      if (instrumentalOnly) body.make_instrumental = true;
      if (vocalGender === "f" || vocalGender === "m") body.vocal_gender = vocalGender;
      if (customMode) body.prompt = boostedPrompt;
      else body.gpt_description_prompt = boostedPrompt;
      if (useMyVoice && myVoiceReady && !instrumentalOnly) {
        body.use_my_voice = true;
        body.custom_mode = true;
        body.mv = "sonic-v5-5";
      }

      const res = await fetch("/api/ai-music/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("failed");
        setErrorMessage(formatKieApiUserMessage(data.message, { creditsProvider: "suno" }) || "생성 요청에 실패했습니다.");
        if (res.status === 403 && (data as { code?: string }).code === "AI_MUSIC_LIMIT_REACHED") {
          toast({ title: data.message, variant: "destructive" });
          queryClient.invalidateQueries({ queryKey: ["/api/ai-music/usage"] });
        }
        if (res.status === 402 && (data as { code?: string }).code === "INSUFFICIENT_CREDITS") {
          toast({ title: data.message ?? "지갑 잔액이 부족합니다.", variant: "destructive" });
          queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
          queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
        }
        return;
      }
      const tid = data.task_id;
      const provider = data.provider ?? undefined;
      if (!tid) {
        setStatus("failed");
        setErrorMessage("서버 응답 오류.");
        return;
      }
      setTaskId(tid);
      setTaskProvider(provider ?? null);
      const wonCharged =
        Number((data as { won_charged?: number }).won_charged) ||
        Number((data as { credits_charged?: number }).credits_charged) ||
        0;
      const creditsBalanceAfter = (data as { balance_won?: unknown; credits_balance?: unknown }).balance_won ?? (data as { credits_balance?: unknown }).credits_balance;
      const balNum = typeof creditsBalanceAfter === "number" ? creditsBalanceAfter : Number(creditsBalanceAfter);
      if (wonCharged > 0) {
        toast({
          title: t("createMusic.toastWonDeductTitle", "차감 안내"),
          description:
            Number.isFinite(balNum) && balNum >= 0
              ? t("createMusic.toastWonDeductWithBalance", "{{n}}원이 차감되었습니다. 지갑 잔액 {{bal}}원", {
                  n: wonCharged.toLocaleString(),
                  bal: balNum.toLocaleString(),
                })
              : t("createMusic.toastWonDeduct", "{{n}}원이 차감되었습니다.", { n: wonCharged.toLocaleString() }),
        });
      }
      if (Number.isFinite(balNum) && balNum >= 0) {
        queryClient.setQueryData(["/api/credits"], { credits: balNum, balanceWon: balNum });
        queryClient.setQueryData(["/api/ai-music/usage"], (prev: typeof aiUsage) =>
          prev ? { ...prev, creditsBalance: balNum, walletCredits: balNum } : prev,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["/api/ai-music/usage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      try {
        sessionStorage.setItem(lastAiMusicTaskSessionKey(user.id), JSON.stringify({ task_id: tid, provider }));
      } catch {}
      pollTask(tid, provider);
    } catch {
      setStatus("failed");
      setErrorMessage("네트워크 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageTransition>
      <div className="min-h-screen bg-white text-slate-900 flex flex-col">
        <Navigation />

        <section className="relative overflow-hidden py-10 px-0">
          <div className="absolute inset-0 bg-gradient-to-b from-white via-white to-slate-50 pointer-events-none" />
          <div className="mx-auto w-full max-w-[1360px] relative z-10 px-4 md:px-8">
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm mb-4">
                <Sparkles className="w-4 h-4" />
                {t("createMusic.badge", "AI 음악 생성")}
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-2">
                {t("createMusic.heroTitle1", "프롬프트로")}{" "}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                  {t("createMusic.heroTitle2", "나만의 음악")}
                </span>{" "}
                {t("createMusic.heroTitle3", "만들기")}
              </h1>
              <p className="text-muted-foreground">
                {t(
                  "createMusic.heroDesc",
                  "가사나 스타일을 입력하면 AI가 음악을 생성합니다. 생성된 곡은 재생·다운로드한 뒤 「신곡으로 공개」해 사이트에 올릴 수 있습니다.",
                )}
              </p>
              <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400 max-w-2xl mx-auto leading-relaxed underline decoration-red-600 dark:decoration-red-400 underline-offset-2">
                {t(
                  "createMusic.heroCopyrightWarning",
                  "유명가수를 모방하는 내용을 사용하면 알고리즘에 의해 저작권에 걸리므로 주의하세요",
                )}
              </p>
            </div>

            {!authLoading && !user && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center max-w-xl mx-auto">
                <p className="text-amber-900 mb-4">{t("createMusic.loginRequired", "로그인 후 음악 생성을 이용할 수 있습니다.")}</p>
                <Link href={LOGIN_PATH}>
                  <Button className="rounded-full">{t("nav.login", "로그인")}</Button>
                </Link>
              </div>
            )}

            {user && (
              <>
                {aiUsage != null && (
                  <div className="w-full max-w-none mx-auto mb-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Link
                        href="/credits"
                        className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-2.5 text-center hover:bg-amber-500/15 transition-colors min-h-[4.25rem]"
                      >
                        <div className="flex items-center gap-2 text-xs font-medium text-amber-900/90">
                          <Coins className="w-4 h-4 text-amber-400 shrink-0" />
                          {t("createMusic.walletBalanceLabel", "지갑잔액/후원·유료 음원 구매 등 (지갑 충전 페이지)")}
                        </div>
                        <strong className="text-xl tabular-nums text-slate-900">
                          {Math.max(0, Number(aiUsage.walletCredits ?? aiUsage.creditsBalance ?? 0)).toLocaleString()}
                          <span className="text-sm font-medium text-amber-100/90 ml-0.5">{t("common.won", "원")}</span>
                        </strong>
                      </Link>
                      <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl border border-violet-500/35 bg-violet-500/10 px-4 py-2.5 text-center min-h-[4.25rem]">
                        {(() => {
                          /** 서버와 동일 규칙(한도 숫자로 추측하지 않음 — 캐시/구버전 응답에서 PC·모바일 표시 불일치 방지) */
                          const q =
                            aiUsage.quota ??
                            {
                              kind:
                                user?.role === "admin"
                                  ? ("unlimited" as const)
                                  : (user?.subscriptionTier ?? "free") === "free"
                                    ? ("songs" as const)
                                    : ("subscription_credits" as const),
                              used: aiUsage.usedThisMonth,
                              limit: aiUsage.limit,
                            };
                          if (q.kind === "unlimited") {
                            return (
                              <>
                                <div className="flex items-center gap-2 text-xs font-medium text-violet-900/90">
                                  <Sparkles className="w-4 h-4 text-violet-300 shrink-0" />
                                  {t("createMusic.aiQuotaTitle", "AI 사용 한도")}
                                </div>
                                <strong className="text-lg text-slate-900">{t("createMusic.quotaUnlimited", "무제한")}</strong>
                                <span className="text-[11px] text-slate-700">{t("createMusic.quotaAdminNote", "관리자 계정")}</span>
                              </>
                            );
                          }
                          if (q.kind === "songs") {
                            const promoTracksRemaining = Math.max(0, Number(aiUsage.promoAiCreditsWon ?? 0));
                            const promoTracksPerJob = 2;
                            const promoExpIso = aiUsage.promoAiCreditsExpiresAt ?? null;
                            const promoExpMs = promoExpIso ? new Date(promoExpIso).getTime() : NaN;
                            const promoNotExpiredSong =
                              !promoExpIso || Number.isNaN(promoExpMs) ? true : promoExpMs > Date.now();
                            const promoUsableSong = promoNotExpiredSong && promoTracksRemaining >= promoTracksPerJob;
                            return (
                              <>
                                <div className="flex items-center gap-2 text-xs font-medium text-violet-900/90">
                                  <Sparkles className="w-4 h-4 text-violet-300 shrink-0" />
                                  {t(
                                    "createMusic.freeAiQuotaLabel",
                                    "무료 AI 생성/ 지갑 충전 잔액과 별도 · 매월 1일 기준으로 초기화",
                                  )}
                                </div>
                                <strong className="text-xl tabular-nums text-slate-900">
                                  {t("createMusic.freeAiQuotaCount", "이번 달 {{used}} / {{limit}}곡", {
                                    used: q.used,
                                    limit: Math.max(0, q.limit),
                                  })}
                                </strong>
                                {promoUsableSong ? (
                                  <div className="mt-2 w-full border-t border-violet-400/35 pt-2 space-y-0.5">
                                    <div className="text-[11px] font-medium text-violet-900/85 leading-tight">
                                      {t("createMusic.promoAiEventQuotaLabel", "이벤트 전용 AI 잔액")}
                                    </div>
                                    <strong className="text-lg tabular-nums text-slate-900 block">
                                      {t("createMusic.promoAiEventQuotaTracksLine", "남은 무료 AI 곡 {{tracks}}곡 · 생성 1회 완료 시 보통 {{per}}곡 차감", {
                                        tracks: promoTracksRemaining.toLocaleString("ko-KR"),
                                        per: promoTracksPerJob.toLocaleString("ko-KR"),
                                      })}
                                    </strong>
                                    <span className="text-[10px] text-slate-600 leading-snug block">
                                      {t(
                                        "createMusic.promoAiEventQuotaSub",
                                        "월 무료 한도와 별도로 먼저 사용됩니다. 출금·환불 대상이 아닙니다.",
                                      )}
                                    </span>
                                  </div>
                                ) : promoTracksRemaining > 0 && promoNotExpiredSong ? (
                                  <div className="mt-2 w-full border-t border-violet-400/35 pt-2 space-y-0.5">
                                    <div className="text-[11px] font-medium text-violet-900/85 leading-tight">
                                      {t("createMusic.promoAiEventQuotaLabel", "이벤트 전용 AI 잔액")}
                                    </div>
                                    <strong className="text-lg tabular-nums text-slate-900 block">
                                      {t("createMusic.promoAiEventQuotaTracksShort", "남은 무료 AI 곡 {{tracks}}곡", {
                                        tracks: promoTracksRemaining.toLocaleString("ko-KR"),
                                      })}
                                    </strong>
                                    <span className="text-[10px] text-slate-600 leading-snug block">
                                      {t(
                                        "createMusic.promoAiEventQuotaTracksInsufficient",
                                        "다음 생성은 보통 2곡이 묶여 나오며, 잔여가 부족하면 월 무료 한도·지갑 순으로 적용됩니다.",
                                      )}
                                    </span>
                                  </div>
                                ) : promoTracksRemaining > 0 && !promoNotExpiredSong ? (
                                  <span className="text-[10px] text-amber-800/90 mt-1 block leading-snug">
                                    {t("createMusic.promoAiEventExpiredNote", "이벤트 전용 잔액은 만료되어 월 한도·지갑 순으로 적용됩니다.")}
                                  </span>
                                ) : null}
                              </>
                            );
                          }
                          const remaining = q.limit >= 0 ? Math.max(0, q.limit - q.used) : 0;
                          const planWon = aiUsage.subscriptionAiPlanGrantWon;
                          const walletWon = aiUsage.subscriptionAiWalletRemainingWon;
                          const perWon = aiUsage.wonPerMusicCreate ?? aiUsage.creditsPerMusicCreate ?? 150;
                          const hasPackLine =
                            typeof planWon === "number" &&
                            Number.isFinite(planWon) &&
                            typeof walletWon === "number" &&
                            Number.isFinite(walletWon);
                          return (
                            <>
                              <div className="flex items-center gap-2 text-xs font-medium text-violet-900/90">
                                <Sparkles className="w-4 h-4 text-violet-300 shrink-0" />
                                {t("createMusic.subscriptionAiLabelWon", "구독 AI 예산 (베이직 등)")}
                              </div>
                              {hasPackLine ? (
                                <strong className="text-base sm:text-lg tabular-nums text-slate-900 leading-snug text-center px-0.5">
                                  {t("createMusic.subscriptionAiPackLine", "충전금 {{charged}}원 · 사용량 {{used}}원 · 남은 사용 가능 금액 {{remaining}}원", {
                                    charged: Math.max(0, Math.floor(planWon)).toLocaleString(),
                                    used: Math.max(0, Math.floor(q.used)).toLocaleString(),
                                    remaining: Math.max(0, Math.floor(walletWon)).toLocaleString(),
                                  })}
                                </strong>
                              ) : (
                                <strong className="text-xl tabular-nums text-slate-900">
                                  {t("createMusic.subscriptionAiQuotaCountWon", "이번 달 {{used}} / {{limit}}원", {
                                    used: q.used.toLocaleString(),
                                    limit: q.limit.toLocaleString(),
                                  })}
                                </strong>
                              )}
                              {hasPackLine && q.limit > planWon ? (
                                <span className="text-[10px] text-violet-200/85 leading-tight px-1 block">
                                  {t(
                                    "createMusic.subscriptionAiPackTotalNote",
                                    "이번 기간 총 한도 {{total}}원(플랜 월 {{plan}}원·이월 등 반영)",
                                    {
                                      total: Math.max(0, Math.floor(q.limit)).toLocaleString(),
                                      plan: Math.max(0, Math.floor(planWon)).toLocaleString(),
                                    },
                                  )}
                                </span>
                              ) : null}
                              <span className="text-[11px] text-violet-100/70 leading-tight px-1">
                                {hasPackLine
                                  ? t("createMusic.subscriptionAiPackPerCreate", "생성 1회당 {{per}}원 차감 · 예산이 0원이 되면 무료 플랜으로 전환됩니다.", {
                                      per: perWon.toLocaleString(),
                                    })
                                  : String(aiUsage.usagePeriodKey ?? "").startsWith("sub:")
                                    ? t(
                                        "createMusic.subscriptionAiQuotaSubWonMonthlyCycle",
                                        "남은 예산 {{n}}원 · 생성 1회당 {{per}}원. 달이 바뀌어도 구독 만료 전까지 한도는 이어지며, 재결제 시 초기화됩니다.",
                                        {
                                          n: remaining.toLocaleString(),
                                          per: perWon.toLocaleString(),
                                        },
                                      )
                                    : t(
                                        "createMusic.subscriptionAiQuotaSubWon",
                                        "남은 월 예산 {{n}}원 · 생성 1회당 {{per}}원 (충전 잔액은 AI에 사용 안 됨)",
                                        {
                                          n: remaining.toLocaleString(),
                                          per: perWon.toLocaleString(),
                                        },
                                      )}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    {aiUsage.deductsCreditsPerCreate ? (
                      <p className="text-sm text-muted-foreground text-center">
                        {t("createMusic.wonDeductHint", "음악 1회 생성 시 지갑에서 {{n}}원이 차감됩니다. (구독 만료 등)", {
                          n: (aiUsage.wonPerMusicCreate ?? aiUsage.creditsPerMusicCreate ?? 150).toLocaleString(),
                        })}
                      </p>
                    ) : user?.role === "admin" ? (
                      <p className="text-sm text-muted-foreground text-center">
                        {t("createMusic.creditsAdminHint", "관리자 계정은 생성 시 지갑이 차감되지 않습니다.")}
                      </p>
                    ) : aiUsage.isPaidTier ? (
                      <p className="text-sm text-muted-foreground text-center">
                        {t(
                          "createMusic.creditsSubscriptionHint",
                          "구독에 포함된 AI 월 예산(원)만 소모됩니다. 지갑 충전액은 AI 생성에 쓰이지 않습니다.",
                        )}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center">
                        {t("createMusic.creditsFreeHint", "무료 플랜은 월 곡 수 한도 내에서 지갑 없이 생성할 수 있습니다.")}
                      </p>
                    )}
                  </div>
                )}
                {aiUsage && aiUsage.limit > 0 && aiUsage.usedThisMonth >= aiUsage.limit && (
                  <p className="text-center text-sm text-muted-foreground mb-2">
                    {t("createMusic.usageThisMonth", "이번 달")} {aiUsage.usedThisMonth}/{aiUsage.limit}
                    {aiUsage.limit <= 10 ? t("createMusic.usageSongs", "곡 생성") : t("createMusic.usageWonBudget", "원 예산 사용")}
                    <Link href="/pricing" className="ml-1 text-primary hover:underline">
                      {aiUsage.isPaidTier ? t("createMusic.upgradePlan", "플랜 업그레이드") : t("createMusic.upgradeToUnlimited", "Pro로 업그레이드")}
                    </Link>
                  </p>
                )}
                <div className="w-full space-y-6" data-testid="create-music-workspace">
                  {/* 상단: 음악 생성 섹션 (넓게) */}
                  <div className="w-full rounded-3xl border-2 border-border/60 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_18px_50px_-18px_rgba(0,0,0,0.25)] overflow-hidden">
                    <div className="grid grid-cols-1 gap-0 items-stretch w-full">
                    {/* 왼쪽: 생성 폼 */}
                    <div className="flex flex-col items-stretch p-5 md:p-7 lg:p-8 bg-white">
                    <div className="mb-4 flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 text-purple-700 ring-1 ring-purple-200">
                        <Wand2 className="h-4 w-4" aria-hidden />
                      </span>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-purple-700">
                          {t("createMusic.sectionCreateLabel", "새로 만들기")}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{t("createMusic.sectionCreateHint", "프롬프트를 입력하고 생성을 누르세요")}</p>
                      </div>
                    </div>
                    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 w-full max-w-none space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">{t("createMusic.modeLabel", "생성 방식")}</label>
                        <div className="flex gap-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="mode" checked={mode === "description"} onChange={() => setMode("description")} className="rounded-full" />
                            <span>{t("createMusic.modeDescription", "설명으로 생성")}</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="mode"
                              checked={mode === "custom"}
                              onChange={() => {
                                setMode("custom");
                                setPrompt((p) => stripAllDescriptionThemeSnippets(p));
                              }}
                              className="rounded-full"
                            />
                            <span>{t("createMusic.modeCustom", "가사 직접 입력")}</span>
                          </label>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={isSubmitting || cv.busy}
                          onClick={() => {
                            resetCvDrafts();
                            setCustomVoiceOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-violet-400 bg-violet-100 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-200 disabled:opacity-50"
                          title={t(
                            "createMusic.customVoiceChipHint",
                            "내 목소리를 녹음·등록한 뒤, 아래 체크를 켜고 생성하면 내 보이스로 노래가 만들어집니다.",
                          )}
                        >
                          <Mic className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {myVoiceReady
                            ? t("createMusic.customVoiceChipRegistered", "내 보이스 다시 등록")
                            : t("createMusic.customVoiceChip", "내 보이스 등록")}
                        </button>
                        {myVoiceReady ? (
                          <span className="text-xs text-violet-800/90">
                            {t("createMusic.customVoiceReadyBadge", "등록됨")}: {myVoiceProfile?.voiceName || "My Voice"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t(
                              "createMusic.customVoiceChipGuide",
                              "등록 후 「등록한 내 보이스로 노래 생성」을 켜고 생성하세요.",
                            )}
                          </span>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1">{t("createMusic.titleLabel", "제목 (선택)")}</label>
                        <input
                          type="text"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="w-full rounded-lg bg-white border border-slate-200 px-4 py-2"
                          placeholder={t("createMusic.titlePlaceholder", "예: Starry Night")}
                          maxLength={80}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-end justify-between gap-2">
                          <label className="block text-sm font-medium">{t("createMusic.genreSectionLabel", "장르")}</label>
                          {genreOther.trim() && (
                            <button
                              type="button"
                              onClick={() => {
                                setGenreOther("");
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                            >
                              {t("createMusic.genreClear", "장르 선택 초기화")}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {t(
                            "createMusic.genreHint",
                            "자주 쓰는 장르를 탭하면 아래 입력란에 현재 언어 라벨(한국어 설정 시 한글)이 들어가며, 직접 수정·추가할 수 있습니다. 프리셋은 최대 {{n}}개까지. 아래 스타일(보컬·악기 등)과 합쳐져 생성 API의 장르/스타일 태그로 전달됩니다.",
                            { n: MAX_GENRE_PRESETS },
                          )}
                        </p>
                        <div className="-mx-2 px-2 pb-1">
                          <div className="flex flex-wrap gap-2 max-h-[4.75rem] overflow-hidden">
                          {GENRE_PRESET_IDS.map((id) => {
                            const token = genrePresetLabelById[id];
                            const selected = fieldHasPresetToken(genreOther, token);
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => {
                                  setGenreOther((prev) => {
                                    const { next, atMax } = togglePresetTokenInField(
                                      prev,
                                      token,
                                      MAX_GENRE_PRESETS,
                                      genrePresetMapForToggle,
                                    );
                                    if (atMax) {
                                      toast({
                                        title: t(
                                          "createMusic.genreMaxNote",
                                          "장르 프리셋은 최대 {{n}}개까지 선택할 수 있습니다.",
                                          { n: MAX_GENRE_PRESETS },
                                        ),
                                      });
                                    }
                                    return next;
                                  });
                                }}
                                className={cn(
                                  "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                                  selected
                                    ? "border-primary/50 bg-primary/10 text-primary shadow-sm shadow-primary/5"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-primary/35 hover:bg-slate-50",
                                )}
                              >
                                {t(`createMusic.genreChip.${id}`, GENRE_API_TOKEN[id])}
                              </button>
                            );
                          })}
                          </div>
                        </div>
                        <input
                          type="text"
                          value={genreOther}
                          onChange={(e) => setGenreOther(e.target.value)}
                          className="w-full rounded-lg bg-white border border-slate-200 px-4 py-2 text-sm"
                          placeholder={t("createMusic.genreOtherPlaceholder", "예: city pop, synthwave")}
                          maxLength={120}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-end justify-between gap-2">
                          <label className="block text-sm font-medium">
                            {t("createMusic.styleSectionLabel", "보컬/악기 스타일")}
                          </label>
                          {styleOther.trim() && (
                            <button
                              type="button"
                              onClick={() => {
                                setStyleOther("");
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                            >
                              {t("createMusic.styleClear", "보컬/악기 스타일 초기화")}
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {t(
                            "createMusic.styleHint",
                            "보컬·악기·템포 등을 칩으로 고르거나 아래에 직접 입력할 수 있습니다. 프리셋은 최대 {{n}}개까지. 위 장르와 합쳐져 Suno에 스타일 문자열로 전달됩니다. 같은 ‘여성 보컬’ 태그라도 모델·시드에 따라 비슷하게 들릴 수 있으며, 가사·설명에 톤(허스키, 어린 목소리 등)을 적으면 차이가 나기 쉽습니다.",
                            { n: MAX_STYLE_PRESETS },
                          )}
                        </p>
                        <div className="-mx-2 px-2 pb-1">
                          <div className="flex flex-wrap gap-2 max-h-[4.75rem] overflow-hidden">
                          {STYLE_PRESET_IDS.map((id) => {
                            const token = STYLE_API_TOKEN[id];
                            const selected = fieldHasPresetToken(styleOther, token);
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => {
                                  setStyleOther((prev) => {
                                    const { next, atMax } = togglePresetTokenInField(
                                      prev,
                                      token,
                                      MAX_STYLE_PRESETS,
                                      STYLE_API_TOKEN,
                                    );
                                    if (atMax) {
                                      toast({
                                        title: t(
                                          "createMusic.styleMaxNote",
                                          "스타일 프리셋은 최대 {{n}}개까지 선택할 수 있습니다.",
                                          { n: MAX_STYLE_PRESETS },
                                        ),
                                      });
                                    }
                                    return next;
                                  });
                                }}
                                className={cn(
                                  "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                                  selected
                                    ? "border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-700 shadow-sm shadow-fuchsia-500/5"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-fuchsia-500/35 hover:bg-slate-50",
                                )}
                              >
                                {t(`createMusic.styleChip.${id}`, STYLE_CHIP_FALLBACK_LABEL[id] ?? STYLE_API_TOKEN[id])}
                              </button>
                            );
                          })}
                          </div>
                        </div>
                        <input
                          type="text"
                          value={styleOther}
                          onChange={(e) => setStyleOther(e.target.value)}
                          className="w-full rounded-lg bg-white border border-slate-200 px-4 py-2 text-sm"
                          placeholder={t("createMusic.styleOtherPlaceholder", "예: reverb-heavy mix, lo-fi crackle")}
                          maxLength={160}
                        />
                      </div>
                      <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <Checkbox
                          id="create-music-instrumental"
                          checked={instrumentalOnly}
                          onCheckedChange={(v) => setInstrumentalOnly(v === true)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 space-y-1">
                          <label htmlFor="create-music-instrumental" className="text-sm font-medium leading-snug cursor-pointer block">
                            {t("createMusic.instrumentalLabel", "연주만 (보컬 없음)")}
                          </label>
                          <p className="text-xs text-slate-600 leading-relaxed">
                            {t(
                              "createMusic.instrumentalHint",
                              "켜면 서버에 무보컬 생성을 요청합니다. 피아노·기타 등은 스타일 칩·직접 입력으로 지정하고, 설명 모드에서는 아래 칸에 연주곡 분위기를 적어 주세요.",
                            )}
                          </p>
                        </div>
                      </div>
                      <div>

                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                          <label className="block text-sm font-medium">
                            {mode === "custom"
                              ? instrumentalOnly
                                ? t("createMusic.promptLabelInstrumental", "가사 (연주만이면 비워도 됨)")
                                : t("createMusic.promptLabel", "가사 (필수)")
                              : t("createMusic.lyricsInputLabel", "가사입력(가사가 있는 곡은 가사를 입력하세요)")}
                          </label>
                          {!instrumentalOnly && (
                            <div className="flex flex-wrap items-center gap-2 ml-auto">
                              <button
                                type="button"
                                onClick={() => void handleStudioOptimizeLyrics()}
                                disabled={lyricsAssistLoading !== null}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:border-violet-300 hover:text-violet-800 transition-colors disabled:opacity-50"
                              >
                                {lyricsAssistLoading === "optimize" ? (
                                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                                ) : (
                                  <Wand2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                )}
                                {t("createMusic.studioLyricsOptimize", "최적화")}
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleStudioGenerateLyrics()}
                                disabled={lyricsAssistLoading !== null}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs text-violet-800 hover:border-violet-300 transition-colors disabled:opacity-50"
                              >
                                {lyricsAssistLoading === "generate" ? (
                                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                                ) : (
                                  <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                )}
                                {t("createMusic.studioLyricsGenerate", "가사 생성")}
                              </button>
                            </div>
                          )}
                        </div>

                        <textarea
                          value={prompt}
                          onChange={(e) => setPrompt(e.target.value)}
                          className="w-full rounded-lg bg-white border border-slate-200 px-4 py-3 min-h-[120px] resize-y"
                          placeholder={
                            mode === "custom"
                              ? instrumentalOnly
                                ? t(
                                    "createMusic.promptPlaceholderInstrumental",
                                    "연주만일 때는 비워도 됩니다. 멜로디·분위기 힌트를 적으면 선택입니다.",
                                  )
                                : t("createMusic.promptPlaceholder", "[Verse]\n가사 입력...\n\n[Chorus]\n후렴구...")
                              : instrumentalOnly
                                ? t(
                                    "createMusic.lyricsInputPlaceholderInstrumental",
                                    "예: 잔잔한 솔로 피아노, 카페 배경용으로 부드럽게, 보컬 없이",
                                  )
                                : t("createMusic.lyricsInputPlaceholder", "가사가 있으면 가사를 입력하고, 없으면 원하는 분위기나 설명을 입력하세요.")
                          }
                          required={mode === "custom" && !instrumentalOnly}
                        />
                        {mode === "custom" && !instrumentalOnly && (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {t(
                              "createMusic.lyricsHint",
                              "입력한 가사는 그대로 전달됩니다. [Verse], [Chorus] 등 구조를 쓰면 반영이 좋습니다. 실제 노래는 AI 서비스에 따라 다를 수 있습니다.",
                            )}
                          </p>
                        )}
                        {mode === "custom" && instrumentalOnly && (
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            {t(
                              "createMusic.instrumentalCustomHint",
                              "연주만 + 가사 직접 입력 모드에서는 스타일(장르·스타일 칩)과 제목이 중요합니다. 가사 칸은 비워도 됩니다.",
                            )}
                          </p>
                        )}
                        {mode === "description" && (
                          <div className="mt-3 space-y-2">
                            <div className="flex flex-wrap items-end justify-between gap-2">
                              <label className="block text-sm font-medium">
                                {t("createMusic.themeSectionLabel", "가사·분위기 주제")}
                              </label>
                              {countThemeSnippetsInPrompt(prompt) > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setPrompt((p) => stripAllDescriptionThemeSnippets(p))}
                                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                                >
                                  {t("createMusic.themeClear", "주제 칩 초기화")}
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {t(
                                "createMusic.themeHint",
                                "칩을 누르면 위 입력란에 주제 문장이 추가되고, 다시 누르면 제거됩니다. 직접 수정·삭제도 가능합니다(최대 {{n}}개).",
                                { n: MAX_DESCRIPTION_THEMES },
                              )}
                            </p>
                            <div className="-mx-2 px-2 pb-1">
                              <div className="flex flex-wrap gap-2 max-h-[4.75rem] overflow-hidden">
                                {DESCRIPTION_THEME_IDS.map((id) => {
                                  const snippet = DESCRIPTION_THEME_SNIPPET[id];
                                  const selected = prompt.includes(snippet);
                                  return (
                                    <button
                                      key={id}
                                      type="button"
                                      onClick={() => {
                                        setPrompt((p) => {
                                          if (p.includes(snippet)) {
                                            return removeThemeSnippetOnce(p, snippet);
                                          }
                                          if (countThemeSnippetsInPrompt(p) >= MAX_DESCRIPTION_THEMES) {
                                            toast({
                                              title: t(
                                                "createMusic.themeMaxNote",
                                                "주제 칩은 최대 {{n}}개까지 선택할 수 있습니다.",
                                                { n: MAX_DESCRIPTION_THEMES },
                                              ),
                                            });
                                            return p;
                                          }
                                          return appendThemeSnippetToPrompt(p, snippet);
                                        });
                                      }}
                                      className={cn(
                                        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                                        selected
                                          ? "border-amber-500/50 bg-amber-500/10 text-amber-900 shadow-sm shadow-amber-500/10"
                                          : "border-slate-200 bg-white text-slate-700 hover:border-amber-500/40 hover:bg-slate-50",
                                      )}
                                    >
                                      {t(`createMusic.themeChip.${id}`, id)}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      {myVoiceReady && !instrumentalOnly ? (
                        <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3">
                          <Checkbox
                            id="create-music-use-my-voice"
                            checked={useMyVoice}
                            onCheckedChange={(v) => setUseMyVoice(v === true)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 space-y-1">
                            <label htmlFor="create-music-use-my-voice" className="text-sm font-medium leading-snug cursor-pointer block">
                              {t("createMusic.useMyVoiceLabel", "등록한 내 보이스로 노래 생성")}
                            </label>
                            <p className="text-xs text-slate-600 leading-relaxed">
                              {t(
                                "createMusic.useMyVoiceHint",
                                "켜면 AI가 등록한 목소리 프로필(voiceId)로 보컬을 부릅니다. v5.5 모델·가사 직접 입력 모드가 적용됩니다.",
                              )}
                            </p>
                          </div>
                        </div>
                      ) : null}
                      <div className="space-y-1.5">
                        <label className="block text-sm font-medium">
                          {t("createMusic.modelVersionLabel", "생성 모델 버전")}
                        </label>
                        <Select
                          value={creationModelVersion}
                          onValueChange={(v) => setCreationModelVersion(v as "sonic-v4-5" | "sonic-v5-5")}
                          disabled={useMyVoice && myVoiceReady}
                        >
                          <SelectTrigger className="w-full max-w-md bg-white border-slate-200">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sonic-v4-5">
                              {t("createMusic.modelV45", "v4.5 계열 (sonic-v4-5, 기본)")}
                            </SelectItem>
                            <SelectItem value="sonic-v5-5">
                              {t("createMusic.modelV55", "v5.5 계열 (sonic-v5-5)")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {t(
                            "createMusic.modelVersionHint",
                            "좀더 안정적이고 향상된 기능을 제공하는 업데이트이지만 사용해 보고 마음에 드는 버전으로 선택해 사용하세요",
                          )}
                        </p>
                      </div>
                      <Button
                        type="submit"
                        disabled={
                          isSubmitting ||
                          status === "pending" ||
                          status === "running" ||
                          status === "preview"
                        }
                        className="w-full rounded-full gap-2"
                        size="lg"
                      >
                        {(status === "pending" || status === "running" || status === "preview") && (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        )}
                        {status === "pending" || status === "running" || status === "preview"
                          ? (() => {
                              const m = Math.floor(elapsedSec / 60);
                              const s = elapsedSec % 60;
                              const elapsed = m > 0 ? `${m}분 ${s}초` : `${s}초`;
                              return t("createMusic.generatingElapsed", {
                                defaultValue: "생성 중... (경과 {{elapsed}})",
                                elapsed,
                              });
                            })()
                          : t("createMusic.submit", "음악 생성하기")}
                      </Button>
                    </form>

                    {status === "failed" && errorMessage && (
                      <div className="mt-4 w-full max-w-xl rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-medium text-red-200">{t("createMusic.failed", "생성 실패")}</p>
                          <p className="text-sm text-red-200/80">{errorMessage}</p>
                        </div>
                      </div>
                    )}

                    <div className="mt-6 flex flex-wrap gap-3">
                      <Link href="/suno-guide">
                        <Button variant="outline" className="rounded-full gap-2 border-slate-200 bg-white hover:bg-slate-50">
                          <Wand2 className="w-4 h-4" />
                          {t("createMusic.guideCta", "음악 만들기 가이드")}
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>

                {/* 하단: 곡 보관함 섹션 (아래로, 넓게) */}
                <div className="w-full rounded-3xl border-2 border-slate-200 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_18px_50px_-18px_rgba(0,0,0,0.25)] overflow-hidden">
                  <div className="flex flex-col p-5 md:p-7 lg:p-8 min-w-0 bg-white">
                    <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-fuchsia-100 text-fuchsia-700 ring-1 ring-fuchsia-200">
                        <Music className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1 basis-[min(100%,14rem)]">
                        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[11px] leading-snug">
                          <span className="text-xs font-semibold uppercase tracking-wider text-fuchsia-700 shrink-0">
                            {t("createMusic.sectionLibraryLabel", "곡 보관함")}
                          </span>
                          <span className="text-slate-400 shrink-0 select-none" aria-hidden>
                            ·
                          </span>
                          <span className="text-slate-600 shrink-0">
                            {t("createMusic.sectionLibraryHint", "재생·다운로드·신곡 공개")}
                          </span>
                        </div>
                      </div>
                      {scorePdfEnabled ? (
                        <p className="w-full min-w-0 text-[10px] sm:text-[11px] text-red-600/90 dark:text-red-400/90 leading-relaxed break-words">
                          {t(
                            "createMusic.sectionLibraryScoreNotice",
                            "※ 악보는 자동으로 만든 참고용 초안입니다. 원곡·실제 연주와 다를 수 있으며, 그대로 연습·공연에 쓰기 어려울 수 있어요.",
                          )}
                        </p>
                      ) : null}
                      <p className="w-full min-w-0 text-[10px] sm:text-[11px] text-amber-900/90 dark:text-amber-200/90 leading-relaxed break-words rounded-lg border border-amber-200/90 bg-amber-50/95 dark:bg-amber-950/30 dark:border-amber-800/50 px-3 py-2 mt-1">
                        {t(
                          "createMusic.sectionLibraryUnpublishedDownloadNotice",
                          "※ 음원은 생성 후 14일 안에 다운로드하세요. 이후 다운로드가 불가합니다. 사이트에 배포(신곡 공개)한 경우는 언제든지 마이페이지에서 다운로드할 수 있습니다.",
                        )}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 md:p-6 flex-1 flex flex-col min-h-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 min-w-0">
                        <h2 className="text-lg font-bold shrink-0">
                          {t("createMusic.resultsTitle", "생성된 곡")} ({savedTracks.length})
                        </h2>
                        {savedTracks.length > 0 && totalDownloads > 0 && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                            <span>
                              {t("createMusic.download", "다운로드")}: {totalDownloads}
                            </span>
                          </div>
                        )}
                      </div>

                      {savedTracks.length > 0 && (
                        <div className="relative mb-3">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                          <input
                            type="text"
                            value={savedTracksSearch}
                            onChange={(e) => setSavedTracksSearch(e.target.value)}
                            placeholder={t("createMusic.searchPlaceholder", "제목·스타일·가사로 검색")}
                            className="w-full rounded-lg bg-white border border-slate-200 pl-9 pr-3 py-2 text-sm"
                          />
                        </div>
                      )}

                      {savedTracks.length === 0 && status !== "pending" && status !== "running" && status !== "preview" ? (
                        <p className="text-slate-600 text-sm">{t("createMusic.noTracksYet", "아직 생성된 곡이 없습니다. 위에서 음악을 생성해 보세요.")}</p>
                      ) : sortedFilteredSavedTracks.length === 0 ? (
                        <p className="text-slate-600 text-sm">{t("createMusic.noSearchResults", "검색 결과가 없습니다.")}</p>
                      ) : (
                        <>
                          <div className="flex flex-col gap-4 min-w-0">
                            <div className="flex-1 min-w-0 space-y-3 pr-1">
                              {savedTracksPageSlice.map((track, index) => (
                                <TrackCard
                                  key={track.id}
                                  track={track}
                                  order={(savedTracksSafePage - 1) * SAVED_TRACKS_LIST_PAGE_SIZE + index + 1}
                                  onRemove={() => removeSavedTrack(track.id)}
                                  onDownload={() => handleDownloadTrack(track)}
                                  libraryDownloadAllowed={Boolean(
                                    aiUsage?.isPaidTier || isFreeAiLibraryDownloadAllowed(track, savedTracks),
                                  )}
                                  onScoreExport={(fmt) => void handleScoreExport(track, fmt)}
                                  scoreExportLoading={scorePdfTrackId === track.id}
                                  scorePdfEnabled={scorePdfEnabled}
                                  onPlay={() => playTrackInGlobalPlayer(track)}
                                  onRequestPublish={(opts) =>
                                    setPublishConfirm({
                                      track,
                                      publishThenDownload: Boolean(opts?.publishThenDownload),
                                    })
                                  }
                                  isPublishing={publishingId === track.id}
                                  isPublished={!!track.publishedToSite}
                                  may2026EventFreeUi={may2026EventFreeUi}
                                  t={t as TTranslate}
                                />
                              ))}
                            </div>
                          </div>
                          {savedTracksTotalPages > 1 && (
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 pt-4 border-t border-slate-200">
                              <p className="text-xs text-slate-600 tabular-nums">
                                {t("createMusic.listPaginationRange", "{{from}}–{{to}}번째 / 총 {{total}}곡", {
                                  from: (savedTracksSafePage - 1) * SAVED_TRACKS_LIST_PAGE_SIZE + 1,
                                  to: Math.min(sortedFilteredSavedTracks.length, savedTracksSafePage * SAVED_TRACKS_LIST_PAGE_SIZE),
                                  total: sortedFilteredSavedTracks.length,
                                })}
                              </p>
                              <div className="flex items-center gap-2 justify-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-1"
                                  disabled={savedTracksSafePage <= 1}
                                  onClick={() => setSavedTracksListPage((p) => Math.max(1, p - 1))}
                                >
                                  <ChevronLeft className="w-4 h-4" />
                                  {t("createMusic.listPagePrev", "이전")}
                                </Button>
                                <span className="text-sm text-slate-600 tabular-nums min-w-[5.5rem] text-center">
                                  {savedTracksSafePage} / {savedTracksTotalPages}
                                </span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-1"
                                  disabled={savedTracksSafePage >= savedTracksTotalPages}
                                  onClick={() => setSavedTracksListPage((p) => Math.min(savedTracksTotalPages, p + 1))}
                                >
                                  {t("createMusic.listPageNext", "다음")}
                                  <ChevronRight className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                </div>
                </div>
              </>
            )}
          </div>
        </section>

        <Footer />
      </div>

      <Dialog
        open={customVoiceOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCustomVoiceOpen(false);
            resetCvDrafts();
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-white text-slate-900 [&_input]:text-slate-900 [&_textarea]:text-slate-900 [&_input]:bg-white [&_textarea]:bg-white [&_input::placeholder]:text-slate-400 [&_textarea::placeholder]:text-slate-400">
          <DialogHeader>
            <DialogTitle>{t("createMusic.customVoiceDialogTitle", "내 보이스 등록")}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {t(
                    "createMusic.customVoiceDialogLead",
                    "① 내 목소리 샘플(녹음 또는 오디오 파일) → ② 안내 문구를 노래처럼 녹음·업로드 → 등록 후 「등록한 내 보이스로 노래 생성」을 켜고 생성하세요.",
                  )}
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          {cv.error ? (
            <p className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-lg px-3 py-2 whitespace-pre-line leading-relaxed">
              {cv.error}
            </p>
          ) : null}
          {cv.step === "source" && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("createMusic.customVoiceStepSource", "① 내 목소리 샘플 (약 10~15초)")}</p>
              <p className="text-xs text-amber-900/90 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 leading-relaxed">
                {t("createMusic.customVoiceSourceTip", KIE_VOICE_COPYRIGHT_REJECTION_USER_MESSAGE)}
              </p>
              {renderCvAudioCapture("source")}
            </div>
          )}
          {cv.step === "phrase" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
              {t("createMusic.customVoiceStepPhraseWait", "검증 문구 생성 중…")}
            </div>
          )}
          {cv.step === "verify" && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{t("createMusic.customVoiceStepVerify", "② 아래 문구를 노래처럼 읽어 녹음·업로드")}</p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 min-h-[3.5rem] flex flex-col justify-center gap-2">
                {cv.validatePhrase ? (
                  <p className="text-sm leading-relaxed text-amber-950 whitespace-pre-line">{cv.validatePhrase}</p>
                ) : cv.busy ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    {t("createMusic.customVoicePhraseLoading", "검증 문구 불러오는 중…")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {t("createMusic.customVoicePhraseMissing", "검증 문구가 표시되지 않았습니다.")}
                    </p>
                    {cv.validateTaskId ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={cv.busy}
                        onClick={() => void cv.pollValidatePhrase(cv.validateTaskId!).catch(() => {})}
                      >
                        {t("createMusic.customVoicePhraseRetry", "문구 다시 불러오기")}
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
              {renderCvAudioCapture("verify")}
              <Button type="button" variant="secondary" disabled={!cvVerifyBlob} onClick={() => cv.setStep("meta")}>
                {t("createMusic.customVoiceNextMeta", "다음: 이름·스타일")}
              </Button>
            </div>
          )}
          {cv.step === "meta" && (
            <div className="space-y-3">
              <input
                className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 px-3 py-2 text-sm"
                placeholder={t("createMusic.customVoiceNamePh", "보이스 이름")}
                value={cv.voiceName}
                onChange={(e) => cv.setVoiceName(e.target.value)}
              />
              <input
                className="w-full rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 px-3 py-2 text-sm"
                placeholder={t("createMusic.customVoiceStylePh", "Pop, Korean vocal")}
                value={cv.style}
                onChange={(e) => cv.setStyle(e.target.value)}
              />
              <Select value={cv.singerSkillLevel} onValueChange={cv.setSingerSkillLevel}>
                <SelectTrigger className="w-full bg-white text-slate-900 border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">{t("createMusic.skillBeginner", "초급")}</SelectItem>
                  <SelectItem value="intermediate">{t("createMusic.skillIntermediate", "중급")}</SelectItem>
                  <SelectItem value="advanced">{t("createMusic.skillAdvanced", "고급")}</SelectItem>
                  <SelectItem value="professional">{t("createMusic.skillPro", "프로")}</SelectItem>
                </SelectContent>
              </Select>
              <Textarea
                className="min-h-[72px] rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 px-3 py-2 text-sm"
                value={cv.description}
                onChange={(e) => cv.setDescription(e.target.value)}
              />
            </div>
          )}
          {cv.step === "done" && (
            <p className="text-sm font-medium text-green-700">{t("createMusic.customVoiceDone", "등록 완료. 다이얼로그를 닫고 「등록한 내 보이스로 노래 생성」으로 곡을 만드세요.")}</p>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setCustomVoiceOpen(false)}>{t("common.cancel", "취소")}</Button>
            {cv.step === "source" && (
              <Button
                type="button"
                className="bg-violet-600 hover:bg-violet-700 text-white"
                disabled={!cvSourceBlob || cv.busy}
                onClick={() =>
                  void cv
                    .submitSource(cvSourceBlob!)
                    .then((phrase) => {
                      if (phrase?.trim()) {
                        toast({
                          title: t("createMusic.customVoicePhraseReady", "검증 문구 준비됨"),
                          description: phrase.length > 120 ? `${phrase.slice(0, 120)}…` : phrase,
                        });
                      }
                    })
                    .catch(() => {})
                }
              >
                {cv.busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t("createMusic.customVoiceSubmitSource", "샘플 업로드")}
              </Button>
            )}
            {cv.step === "meta" && (
              <Button
                type="button"
                className="bg-violet-600 hover:bg-violet-700 text-white"
                disabled={!cvVerifyBlob || cv.busy}
                onClick={() =>
                  void cv.submitVerifyAndRegister(cvVerifyBlob!).then((vid) => {
                    queryClient.invalidateQueries({ queryKey: ["/api/ai-music/custom-voice"] });
                    setUseMyVoice(true);
                    setCustomVoiceOpen(false);
                    resetCvDrafts();
                    toast({ title: t("createMusic.customVoiceRegisterDone", "내 보이스 등록 완료") });
                  }).catch(() => {})
                }
              >
                {cv.busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t("createMusic.customVoiceSubmitRegister", "등록 완료")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 신곡 공개 동의 다이얼로그 (무료·미공개: 동의 후 공개 + 파일 다운로드) */}
      <Dialog open={!!publishConfirm} onOpenChange={(open) => { if (!open) setPublishConfirm(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {publishConfirm?.publishThenDownload ? (
                <Download className="w-5 h-5 text-violet-500" />
              ) : (
                <Globe className="w-5 h-5 text-violet-500" />
              )}
              {publishConfirm?.publishThenDownload
                ? may2026EventFreeUi
                  ? t("createMusic.publishDialogTitleMay2026Download", "다운로드 (사이트에 동시 공개)")
                  : t("createMusic.publishDialogTitleDownload", "다운로드 및 사이트 공개")
                : t("createMusic.publishDialogTitlePublish", "신곡으로 사이트에 공개")}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <span className="font-semibold text-foreground">"{publishConfirm?.track.title || "AI 생성 음악"}"</span>
                  {publishConfirm?.publishThenDownload
                    ? may2026EventFreeUi
                      ? t(
                          "createMusic.publishDialogLeadMay2026",
                          "을(를) 파일로 저장하면서 베니사운드 신곡 목록에 공개합니다. (같은 생성분이 있으면 함께 공개될 수 있습니다)",
                        )
                      : t("createMusic.publishDialogLeadCombined", "을(를) 베니사운드에 공개한 뒤, 같은 음원 파일을 기기에 저장합니다.")
                    : t("createMusic.publishDialogLeadPublish", "을(를) 베니사운드 신곡 목록에 공개합니다.")}
                </p>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs space-y-1.5">
                  <p className="font-semibold text-amber-700 dark:text-amber-400">
                    {t("createMusic.publishDialogCheckHeading", "공개 전 확인해주세요")}
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-amber-700 dark:text-amber-500">
                    <li>{t("createMusic.publishDialogBulletAiBadge", "AI 생성 배지가 자동으로 표시됩니다")}</li>
                    <li>
                      {t(
                        "createMusic.publishDialogBulletSameTaskDownloads",
                        "같은 생성으로 나온 여러 곡이 있으면, 모두 사이트에 공개된 뒤에 각각 라이브러리 다운로드가 열립니다.",
                      )}
                    </li>
                    <li>{t("createMusic.publishDialogBulletFreeLimit", "무료 플랜은 AI 공개곡 수에 제한이 있을 수 있습니다")}</li>
                    <li>{t("createMusic.publishDialogBulletMonetization", "수익화(유료 다운로드)는 플랜에 따라 제한될 수 있습니다")}</li>
                    <li>{t("createMusic.publishDialogBulletTerms", "이용약관 및 저작권법을 준수해야 합니다")}</li>
                    <li>{t("createMusic.publishDialogBulletModeration", "부적절한 내용은 관리자에 의해 삭제될 수 있습니다")}</li>
                  </ul>
                </div>
                <p className="text-xs">
                  {publishConfirm?.publishThenDownload
                    ? t(
                        "createMusic.publishDialogConsentCombined",
                        "위 내용에 동의하면 사이트 공개 후 파일 다운로드가 이어서 진행됩니다.",
                      )
                    : t("createMusic.publishDialogConsentPublish", "위 내용에 동의하고 신곡으로 공개하시겠습니까?")}
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPublishConfirm(null)}>
              {t("common.cancel", "취소")}
            </Button>
            <Button
              className="bg-violet-600 hover:bg-violet-700 text-white"
              disabled={publishingId === publishConfirm?.track.id}
              onClick={() => {
                void (async () => {
                  const payload = publishConfirm;
                  if (!payload) return;
                  const { track, publishThenDownload } = payload;
                  /** 공개만(다운로드 결합 아님)일 때도 유료·5월이벤트는 같은 task 미공개 클립을 한 번에 배포 — 유료는 형제만 파일 받고 사이트 미배포되는 문제 방지 */
                  const tid = (track.generationTaskId ?? "").trim();
                  const hasUnpublishedSibling =
                    Boolean(tid) &&
                    savedTracksRef.current.some(
                      (x) =>
                        x.id !== track.id &&
                        (x.generationTaskId ?? "").trim() === tid &&
                        !x.publishedToSite &&
                        Boolean((x.audio_url ?? "").trim()),
                    );
                  const canMultiPublishOnServer = Boolean(aiUsage?.isPaidTier || may2026EventFreeUi);
                  const chainSiblings =
                    publishThenDownload || (canMultiPublishOnServer && hasUnpublishedSibling);
                  const ok = await handlePublishTrack(track, { chainSiblings });
                  if (ok && publishThenDownload) {
                    const tid = (track.generationTaskId ?? "").trim();
                    const snap = savedTracksRef.current;
                    const toDownload = tid
                      ? snap.filter((x) => (x.generationTaskId ?? "").trim() === tid && Boolean((x.audio_url ?? "").trim()))
                      : [track];
                    for (const dt of toDownload) {
                      await handleDownloadTrack(dt);
                    }
                  }
                  if (ok) setPublishConfirm(null);
                })();
              }}
            >
              {publishingId === publishConfirm?.track.id ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  {publishConfirm?.publishThenDownload
                    ? t("createMusic.publishDialogWorkingCombined", "처리 중…")
                    : t("createMusic.publishDialogWorkingPublish", "공개 중…")}
                </>
              ) : publishConfirm?.publishThenDownload ? (
                <>
                  <Download className="w-4 h-4 mr-1" />
                  {t("createMusic.publishDialogConfirmCombined", "동의하고 다운로드")}
                </>
              ) : (
                <>
                  <Globe className="w-4 h-4 mr-1" />
                  {t("createMusic.publishDialogConfirmPublish", "동의하고 공개")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageTransition>
  );
}
