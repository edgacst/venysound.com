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
let warnedZeroAlbums = false;

/** Spotify 429/403 연속 호출 완화 — 목록 짧게 캐시 */
let intlReleasesFullListCache: { key: string; expiresAt: number; dtos: InternationalReleaseDto[] } | null =
  null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

/** VenySound user id(로그인 sub) 목록 — 유통 병합 시 해당 등록자만. 비우면 전체 배포 완료 건. */
export function getEnvInternationalFromUserIds(): string[] {
  const raw = normalizeEnvValue(process.env.SPOTIFY_INTERNATIONAL_FROM_USER_IDS);
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)) {
    if (part && !seen.has(part)) {
      seen.add(part);
      out.push(part);
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
  return ["US", "KR", "GB", "JP"];
}

/** Web API 기본과 동일 — album,single 만 쓰면 일부 출시가 빠질 수 있음 */
function getIncludeGroups(): string {
  const raw = normalizeEnvValue(process.env.SPOTIFY_INTERNATIONAL_INCLUDE_GROUPS);
  if (raw) return raw;
  return "album,single,appears_on,compilation";
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
      include_groups: getIncludeGroups(),
      market,
      limit: pageLimit,
    }).toString();

  while (url && out.length < cap) {
    let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      return { albums: out, unauthorized: true };
    }
    if (res.status === 429 || res.status === 403) {
      const ra = parseInt(res.headers.get("retry-after") || "0", 10);
      await sleep(ra > 0 ? Math.min(ra * 1000, 8000) : 800);
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
  /** 한 시장만 401이어도 true였다가 끝까지 앨범이 있으면 false — 전체 해외 목록이 []로 떨어지는 것 방지 */
  let sawUnauthorized = false;
  for (let mi = 0; mi < markets.length; mi++) {
    const market = markets[mi]!;
    if (mi > 0) await sleep(100);
    const { albums, unauthorized: u } = await fetchArtistAlbumsForMarket(token, artistId, market, cap);
    if (u) sawUnauthorized = true;
    for (const al of albums) {
      if (!byId.has(al.id)) byId.set(al.id, al);
      if (byId.size >= cap) break;
    }
    if (byId.size >= cap) break;
  }
  const albums = [...byId.values()];
  return { albums, unauthorized: sawUnauthorized && albums.length === 0 };
}

async function fetchSpotifyAlbumsByIds(token: string, ids: string[]): Promise<SpotifyAlbumSimplified[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];
  const merged = new Map<string, SpotifyAlbumSimplified>();
  let marketCandidates = getInternationalMarkets();
  if (marketCandidates.length === 0) marketCandidates = ["US"];

  for (let i = 0; i < unique.length; i += 20) {
    const chunk = unique.slice(i, i + 20);
    for (let mi = 0; mi < marketCandidates.length; mi++) {
      const mkt = marketCandidates[mi]!;
      if (chunk.every((id) => merged.has(id))) break;
      if (mi > 0) await sleep(120);

      const params = new URLSearchParams({ ids: chunk.join(","), market: mkt });
      const url = "https://api.spotify.com/v1/albums?" + params.toString();

      let res: Response | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) break;
        if (res.status === 401) {
          const t = await res.text().catch(() => "");
          console.error("[spotify-international] albums by ids 401", mkt, t.slice(0, 120));
          break;
        }
        if (res.status === 429 || res.status === 403) {
          const ra = parseInt(res.headers.get("retry-after") || "0", 10);
          await sleep(ra > 0 ? Math.min(ra * 1000, 10_000) : 500 * (attempt + 1));
          continue;
        }
        break;
      }

      if (!res?.ok) {
        const t = await res?.text().catch(() => "") ?? "";
        if (res && res.status !== 401) {
          console.error("[spotify-international] albums by ids error", mkt, res.status, t.slice(0, 200));
        }
        continue;
      }

      const j = (await res.json()) as { albums?: (SpotifyAlbumSimplified | null)[] };
      for (const al of j.albums ?? []) {
        if (!al?.id) continue;
        const prev = merged.get(al.id);
        const prevHas = !!prev?.external_urls?.spotify;
        const nextHas = !!al.external_urls?.spotify;
        if (!prev || (!prevHas && nextHas)) merged.set(al.id, al);
      }
    }
  }
  return unique.map((id) => merged.get(id)).filter((x): x is SpotifyAlbumSimplified => !!x);
}

async function searchSpotifyAlbumIdByUpc(token: string, upc: string): Promise<string | null> {
  const markets = getInternationalMarkets();
  const mktList = markets.length > 0 ? markets : ["US"];
  for (let mi = 0; mi < mktList.length; mi++) {
    const mkt = mktList[mi]!;
    if (mi > 0) await sleep(100);
    const params = new URLSearchParams({
      q: `upc:${upc}`,
      type: "album",
      limit: "5",
      market: mkt,
    });
    const url = "https://api.spotify.com/v1/search?" + params.toString();

    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) break;
      if (res.status === 429 || res.status === 403) {
        const ra = parseInt(res.headers.get("retry-after") || "0", 10);
        await sleep(ra > 0 ? Math.min(ra * 1000, 8000) : 400 * (attempt + 1));
        continue;
      }
      break;
    }
    if (!res?.ok) continue;
    const j = (await res.json()) as {
      albums?: {
        items?: { id?: string; external_ids?: { upc?: string } }[];
      };
    };
    const items = j.albums?.items ?? [];
    for (const it of items) {
      if (it.external_ids?.upc === upc && it.id) return it.id;
    }
    const first = items[0]?.id;
    if (first) return first;
  }
  return null;
}

async function resolveUpcsToAlbumIds(token: string, upcs: string[]): Promise<string[]> {
  const seen = new Set<string>();
  for (let i = 0; i < upcs.length; i++) {
    if (i > 0) await sleep(90);
    const id = await searchSpotifyAlbumIdByUpc(token, upcs[i]!);
    if (id) seen.add(id);
  }
  return [...seen];
}

function albumToDto(a: SpotifyAlbumSimplified): InternationalReleaseDto | null {
  const spotifyUrl =
    a.external_urls?.spotify || (a.id ? `https://open.spotify.com/album/${a.id}` : null);
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

export type InternationalReleasesMergeInput = {
  /** DB music.spotify_album_id 등 */
  extraSpotifyAlbumIds?: string[];
  /** external_release_ref 에서 뽑은 UPC — Spotify search 로 앨범 id 해석 */
  extraUpcs?: string[];
};

/** Spotify API 없이 카드 메타를 채울 때 routes → storage 에서 전달 */
export type InternationalReleaseDbSeed = {
  spotifyAlbumId: string;
  title: string;
  artists: string;
  imageUrl: string | null;
  releaseDate: string | null;
  musicId: number;
};

function seedByIdFromDb(
  byId: Map<string, SpotifyAlbumSimplified>,
  seeds: InternationalReleaseDbSeed[],
): void {
  for (const row of seeds) {
    const sid = row.spotifyAlbumId.trim();
    if (!sid) continue;
    const img = row.imageUrl?.trim() ?? "";
    byId.set(sid, {
      id: sid,
      name: row.title,
      artists: [{ name: row.artists }],
      images: img ? [{ url: img }] : [],
      external_urls: { spotify: `https://open.spotify.com/album/${sid}` },
      release_date: row.releaseDate ?? undefined,
    });
  }
}

export async function fetchInternationalReleasesPage(
  page: number,
  limit: number,
  merge?: InternationalReleasesMergeInput,
  dbSeeds: InternationalReleaseDbSeed[] = [],
): Promise<{ data: InternationalReleaseDto[]; total: number }> {
  const artistIds = getEnvArtistIds();
  const extraAlbumIds = [...new Set((merge?.extraSpotifyAlbumIds ?? []).map((s) => s.trim()).filter(Boolean))];
  const extraUpcs = [...new Set((merge?.extraUpcs ?? []).map((s) => s.trim()).filter(Boolean))];
  const seeds = dbSeeds ?? [];

  if (seeds.length === 0 && artistIds.length === 0 && extraAlbumIds.length === 0 && extraUpcs.length === 0) {
    if (!warnedNoArtistIds) {
      warnedNoArtistIds = true;
      console.warn(
        "[spotify-international] No international sources: set SPOTIFY_INTERNATIONAL_ARTIST_IDS and/or ship delivered/live distribution with music.spotify_album_id or UPC in external_release_ref",
      );
    }
    return { data: [], total: 0 };
  }

  const dbKey = seeds
    .map((s) => s.spotifyAlbumId)
    .sort()
    .join(",");
  const cacheKey = `${artistIds.join(",")}|${[...extraAlbumIds].sort().join(",")}|${[...extraUpcs].sort().join(",")}|db:${dbKey}`;
  const nowMs = Date.now();
  if (
    intlReleasesFullListCache &&
    intlReleasesFullListCache.key === cacheKey &&
    intlReleasesFullListCache.expiresAt > nowMs
  ) {
    const cached = intlReleasesFullListCache.dtos;
    const total = cached.length;
    const start = (page - 1) * limit;
    return { data: cached.slice(start, start + limit), total };
  }

  const byId = new Map<string, SpotifyAlbumSimplified>();
  seedByIdFromDb(byId, seeds);

  const needSpotify = artistIds.length > 0 || extraAlbumIds.length > 0 || extraUpcs.length > 0;
  const token = needSpotify ? await getClientCredentialsToken() : null;

  if (needSpotify && !token) {
    if (byId.size === 0) {
      return { data: [], total: 0 };
    }
  } else if (needSpotify && token && artistIds.length > 0) {
    let { byId: fromArtists, unauthorized } = await collectAlbumsForArtists(artistIds);
    if (unauthorized) {
      clearSpotifyTokenCache();
      const second = await collectAlbumsForArtists(artistIds);
      fromArtists = second.byId;
      unauthorized = second.unauthorized;
    }
    if (unauthorized && fromArtists.size === 0) {
      if (byId.size === 0) {
        if (!warnedUnauthorized) {
          warnedUnauthorized = true;
          console.warn("[spotify-international] Spotify API returned 401 after retry — check Client ID/Secret");
        }
        return { data: [], total: 0 };
      }
    } else {
      for (const [k, v] of fromArtists) {
        byId.set(k, v);
      }
    }
    if (
      fromArtists.size === 0 &&
      extraAlbumIds.length === 0 &&
      extraUpcs.length === 0 &&
      seeds.length === 0 &&
      !warnedZeroAlbums
    ) {
      warnedZeroAlbums = true;
      console.warn(
        "[spotify-international] 0 albums for artists",
        artistIds.join(","),
        "markets",
        getInternationalMarkets().join(","),
        "— check artist IDs on open.spotify.com and SPOTIFY_INTERNATIONAL_MARKETS",
      );
    }
  }

  if (token && extraUpcs.length > 0) {
    const fromUpcs = await resolveUpcsToAlbumIds(token, extraUpcs);
    const toFetchIds = [...new Set([...extraAlbumIds, ...fromUpcs])].filter((id) => !byId.has(id));
    if (toFetchIds.length > 0) {
      const fetched = await fetchSpotifyAlbumsByIds(token, toFetchIds);
      for (const al of fetched) {
        if (!byId.has(al.id)) byId.set(al.id, al);
      }
    }
  } else if (token && extraAlbumIds.length > 0) {
    const toFetchIds = [...new Set(extraAlbumIds)].filter((id) => !byId.has(id));
    if (toFetchIds.length > 0) {
      const fetched = await fetchSpotifyAlbumsByIds(token, toFetchIds);
      for (const al of fetched) {
        if (!byId.has(al.id)) byId.set(al.id, al);
      }
    }
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
  intlReleasesFullListCache = {
    key: cacheKey,
    expiresAt: Date.now() + (total > 0 ? 120_000 : 90_000),
    dtos,
  };
  return { data, total };
}
