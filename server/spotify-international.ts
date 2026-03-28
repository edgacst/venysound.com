/**
 * Spotify Web API (Client Credentials) — 우리 아티스트의 글로벌(해외) 출시 목록용.
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

let warnedNoArtistIds = false;
let warnedNoToken = false;
let warnedUnauthorized = false;

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

/** open.spotify.com/artist/…, spotify:artist:…, 또는 순수 ID */
function parseSpotifyArtistId(fragment: string): string | null {
  const s = fragment.trim();
  if (!s) return null;
  const uri = /^spotify:artist:([a-zA-Z0-9]+)$/i.exec(s);
  if (uri) return uri[1];
  const url = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?artist\/([a-zA-Z0-9]+)/i.exec(s);
  if (url) return url[1];
  if (/^[a-zA-Z0-9]{22}$/.test(s)) return s;
  if (/^[a-zA-Z0-9]+$/.test(s) && s.length >= 10) return s;
  return null;
}

function getEnvArtistIds(): string[] {
  const raw = normalizeEnvValue(process.env.SPOTIFY_INTERNATIONAL_ARTIST_IDS);
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)) {
    const id = parseSpotifyArtistId(part);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * 해외 출시는 특정 단일 market(예: KR)만 쓰면 해당 지역 미배포 앨범이 전부 빠져 total=0이 될 수 있음.
 * Client Credentials에는 사용자 국가가 없어 market이 사실상 필수에 가깝다 → 여러 market 결과를 합친다.
 */
function getInternationalMarkets(): string[] {
  const raw = normalizeEnvValue(process.env.SPOTIFY_INTERNATIONAL_MARKETS);
  if (raw) {
    const list = raw
      .split(/[,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length === 2);
    return [...new Set(list)];
  }
  const legacy = normalizeEnvValue(process.env.SPOTIFY_MARKET);
  if (legacy.length === 2) return [legacy.toUpperCase()];
  return ["US", "KR"];
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

async function fetchArtistAlbumsForMarket(
  token: string,
  artistId: string,
  market: string,
  cap: number,
): Promise<{ albums: SpotifyAlbumSimplified[]; unauthorized: boolean }> {
  const out: SpotifyAlbumSimplified[] = [];

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
      console.error("[spotify-international] albums error", artistId, market, res.status, t.slice(0, 200));
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

async function fetchArtistAlbumsAll(
  token: string,
  artistId: string,
): Promise<{ albums: SpotifyAlbumSimplified[]; unauthorized: boolean }> {
  const cap = Math.min(500, Math.max(50, parseInt(process.env.SPOTIFY_INTERNATIONAL_ALBUM_CAP || "200", 10) || 200));
  const markets = getInternationalMarkets();
  const byId = new Map<string, SpotifyAlbumSimplified>();
  let unauthorized = false;
  for (const market of markets) {
    const { albums, unauthorized: u } = await fetchArtistAlbumsForMarket(token, artistId, market, cap);
    if (u) unauthorized = true;
    for (const al of albums) {
      if (!byId.has(al.id)) byId.set(al.id, al);
      if (byId.size >= cap) break;
    }
    if (byId.size >= cap) break;
  }
  return { albums: [...byId.values()], unauthorized };
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
    if (!warnedNoToken) {
      warnedNoToken = true;
      const hasId = !!normalizeEnvValue(process.env.SPOTIFY_CLIENT_ID);
      const hasSecret = !!normalizeEnvValue(process.env.SPOTIFY_CLIENT_SECRET);
      console.warn(
        "[spotify-international] no access token (check SPOTIFY_CLIENT_ID/SECRET and token API; creds present:",
        hasId && hasSecret,
        ")",
      );
    }
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
    if (!warnedNoArtistIds) {
      warnedNoArtistIds = true;
      console.warn(
        "[spotify-international] SPOTIFY_INTERNATIONAL_ARTIST_IDS is empty — set comma-separated Spotify artist IDs in .env",
      );
    }
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
    if (!warnedUnauthorized) {
      warnedUnauthorized = true;
      console.warn("[spotify-international] Spotify API returned 401 after retry — check Client ID/Secret");
    }
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
