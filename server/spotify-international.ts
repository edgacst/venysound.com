/**
 * Spotify Web API (Client Credentials) — 해외 배포(글로벌 릴리즈) 목록용.
 * 공개 카탈로그만 조회; 사용자 로그인 불필요.
 */

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

type TokenCache = { token: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

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
  const raw = (process.env.SPOTIFY_INTERNATIONAL_ARTIST_IDS || "").trim();
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
  const id = (process.env.SPOTIFY_CLIENT_ID || "").trim();
  const secret = (process.env.SPOTIFY_CLIENT_SECRET || "").trim();
  if (!id || !secret) return null;

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
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
  };
  return tokenCache.token;
}

async function fetchArtistAlbumsAll(token: string, artistId: string): Promise<SpotifyAlbumSimplified[]> {
  const market = getMarket();
  const out: SpotifyAlbumSimplified[] = [];
  const cap = Math.min(500, Math.max(50, parseInt(process.env.SPOTIFY_INTERNATIONAL_ALBUM_CAP || "200", 10) || 200));

  let url: string | null =
    `https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}/albums?` +
    new URLSearchParams({
      include_groups: "album,single",
      market,
      limit: "50",
    }).toString();

  while (url && out.length < cap) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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

  return out;
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
export async function fetchInternationalReleasesPage(
  page: number,
  limit: number,
): Promise<{ data: InternationalReleaseDto[]; total: number }> {
  const artistIds = getEnvArtistIds();
  const token = await getClientCredentialsToken();

  if (!token || artistIds.length === 0) {
    return { data: [], total: 0 };
  }

  const byId = new Map<string, SpotifyAlbumSimplified>();
  for (const aid of artistIds) {
    const albums = await fetchArtistAlbumsAll(token, aid);
    for (const al of albums) {
      if (!byId.has(al.id)) byId.set(al.id, al);
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
  return { data, total };
}
