/**
 * Spotify Web API (Client Credentials) — 해외 배포(글로벌 릴리즈) 목록용.
 * 공개 카탈로그만 조회; 사용자 로그인 불필요.
 */

import crypto from "crypto";

export type InternationalReleaseDto = {
  id: string;
  title: string;
  artists: string;
  albumName?: string | null;
  imageUrl?: string | null;
  spotifyUrl: string;
  previewUrl?: string | null;
  releaseDate?: string | null;
};

type TokenCache = { token: string; expiresAt: number; credsFp: string };
let tokenCache: TokenCache | null = null;

function normalizeEnvValue(v: string | undefined): string {
  if (v == null) return "";
  return v.replace(/^\uFEFF/, "").trim();
}

/** Client ID/Secret 변경 시 캐시된 토큰이 옛 자격으로 나가지 않도록 */
function spotifyCredentialsFingerprint(): string {
  const id = normalizeEnvValue(process.env.SPOTIFY_CLIENT_ID);
  const secret = normalizeEnvValue(process.env.SPOTIFY_CLIENT_SECRET);
  return crypto.createHash("sha256").update(`${id}\n${secret}`, "utf8").digest("hex").slice(0, 24);
}

function clearSpotifyTokenCache(): void {
  tokenCache = null;
}

type SpotifyImage = { url?: string };
type SpotifyExternalUrls = { spotify?: string };
type SpotifyArtistRef = { name?: string };
type SpotifyAlbumSimplified = {
  id: string;
  name: string;
  artists: SpotifyArtistRef[];
  images: SpotifyImage[];
  external_urls: SpotifyExternalUrls;
  release_date?: string;
  album_type?: string;
  total_tracks?: number;
};

type SpotifyPaged<T> = { items: T[]; next: string | null };

function getEnvArtistIds(): string[] {
  const raw = normalizeEnvValue(process.env.SPOTIFY_INTERNATIONAL_ARTIST_IDS);
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getMarket(): string {
  const m = (process.env.SPOTIFY_MARKET || "KR").trim().toUpperCase();
  return m.length === 2 ? m : "KR";
}

async function getClientCredentialsToken(): Promise<string | null> {
  const id = normalizeEnvValue(process.env.SPOTIFY_CLIENT_ID);
  const secret = normalizeEnvValue(process.env.SPOTIFY_CLIENT_SECRET);
  if (!id || !secret) return null;

  const credsFp = spotifyCredentialsFingerprint();
  const now = Date.now();
  if (
    tokenCache &&
    tokenCache.credsFp === credsFp &&
    tokenCache.expiresAt > now + 60_000
  ) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const auth = Buffer.from(`${id}:${secret}`, "utf8").toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[spotify-international] token error", res.status, errText.slice(0, 200));
    return null;
  }

  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;

  tokenCache = {
    token: j.access_token,
    expiresAt: now + Math.max(60, (j.expires_in ?? 3600)) * 1000,
    credsFp,
  };
  return tokenCache.token;
}

async function fetchArtistAlbumsAll(
  token: string,
  artistId: string,
): Promise<{ albums: SpotifyAlbumSimplified[]; unauthorized: boolean }> {
  const market = getMarket();
  const out: SpotifyAlbumSimplified[] = [];
  const cap = Math.min(500, Math.max(50, parseInt(process.env.SPOTIFY_INTERNATIONAL_ALBUM_CAP || "200", 10) || 200));

  // Spotify가 limit>10 에 대해 400 "Invalid limit" 를 반환하는 경우가 있어 10으로 페이지네이션
  const pageLimit = "10";
  let url: string | null =
    `https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}/albums?` +
    new URLSearchParams({
      include_groups: "album,single",
      market,
      limit: pageLimit,
    }).toString();

  while (url && out.length < cap) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      return { albums: out, unauthorized: true };
    }
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[spotify-international] albums error", artistId, res.status, t.slice(0, 200));
      break;
    }
    const page = (await res.json()) as SpotifyPaged<SpotifyAlbumSimplified>;
    for (const item of page.items ?? []) {
      if (out.length >= cap) break;
      out.push(item);
    }
    url = page.next;
  }

  return { albums: out, unauthorized: false };
}

function albumToDto(a: SpotifyAlbumSimplified): InternationalReleaseDto | null {
  const spotifyUrl = a.external_urls?.spotify;
  if (!spotifyUrl) return null;
  const artists = (a.artists ?? []).map((x) => x.name).filter(Boolean).join(", ") || "—";
  const imageUrl = a.images?.[0]?.url ?? null;
  return {
    id: a.id,
    title: a.name,
    artists,
    albumName: a.release_date ?? null,
    imageUrl,
    spotifyUrl,
    previewUrl: null,
    releaseDate: a.release_date ?? null,
  };
}

function compareReleaseDateDesc(a: InternationalReleaseDto, b: InternationalReleaseDto): number {
  const da = a.releaseDate || "";
  const db = b.releaseDate || "";
  if (da !== db) return db.localeCompare(da);
  return a.title.localeCompare(b.title);
}

/**
 * 설정된 Spotify 아티스트 ID들의 앨범·싱글을 모아 최신순으로 페이지네이션합니다.
 * 자격 증명·아티스트 ID 없으면 빈 목록.
 */
async function collectAlbumsForArtists(
  artistIds: string[],
): Promise<{ byId: Map<string, SpotifyAlbumSimplified>; unauthorized: boolean }> {
  const token = await getClientCredentialsToken();
  if (!token) {
    return { byId: new Map(), unauthorized: false };
  }

  const byId = new Map<string, SpotifyAlbumSimplified>();
  for (const aid of artistIds) {
    const { albums, unauthorized } = await fetchArtistAlbumsAll(token, aid);
    for (const al of albums) {
      if (!byId.has(al.id)) byId.set(al.id, al);
    }
    if (unauthorized) {
      return { byId, unauthorized: true };
    }
  }
  return { byId, unauthorized: false };
}

export async function fetchInternationalReleasesPage(
  page: number,
  limit: number,
): Promise<{ data: InternationalReleaseDto[]; total: number }> {
  const artistIds = getEnvArtistIds();
  if (artistIds.length === 0) {
    return { data: [], total: 0 };
  }

  let { byId, unauthorized } = await collectAlbumsForArtists(artistIds);
  if (unauthorized) {
    clearSpotifyTokenCache();
    const second = await collectAlbumsForArtists(artistIds);
    byId = second.byId;
    unauthorized = second.unauthorized;
  }

  if (unauthorized) {
    return { data: [], total: 0 };
  }

  const dtos: InternationalReleaseDto[] = [];
  for (const al of byId.values()) {
    const dto = albumToDto(al);
    if (dto) dtos.push(dto);
  }
  dtos.sort(compareReleaseDateDesc);

  const total = dtos.length;
  const start = (page - 1) * limit;
  const data = dtos.slice(start, start + limit);
  return { data, total };
}
