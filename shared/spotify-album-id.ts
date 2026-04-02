/** Spotify Web API·공유 링크에서 쓰는 앨범·싱글 ID (base62, 길이 가변) */
const SPOTIFY_ALBUM_ID_RE = /^[0-9A-Za-z]{10,32}$/;

/**
 * 사용자 입력(순수 ID, 전체 URL, spotify:album:…)에서 앨범 ID만 추출.
 * 실패 시 null (빈 문자열 입력은 호출부에서 처리).
 */
export function parseSpotifyAlbumIdFromUserInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (SPOTIFY_ALBUM_ID_RE.test(trimmed)) return trimmed;

  const fromUri = trimmed.match(/^spotify:album:([0-9A-Za-z]{10,32})$/i);
  if (fromUri) return fromUri[1];

  let asUrl = trimmed;
  if (!/^https?:\/\//i.test(asUrl)) asUrl = `https://${asUrl}`;

  try {
    const u = new URL(asUrl);
    const path = u.pathname || "";
    const fromPath = path.match(/\/album\/([0-9A-Za-z]{10,32})(?:\/|$|\?)/i);
    if (fromPath) return fromPath[1];
  } catch {
    /* ignore */
  }

  const loose = trimmed.match(/\/album\/([0-9A-Za-z]{10,32})(?:\/|$|\?|#)/i);
  if (loose) return loose[1];

  return null;
}

export function isBareSpotifyAlbumId(value: string): boolean {
  return SPOTIFY_ALBUM_ID_RE.test(value.trim());
}
