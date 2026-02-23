import { z } from "zod";

export function buildUrl(path: string, params: Record<string, string | number>): string {
  let url = path;
  for (const [key, value] of Object.entries(params)) {
    url = url.replace(new RegExp(`:${key}`, "g"), String(value));
  }
  return url;
}

export const api = {
  music: {
    list: { path: "/api/music" },
    get: { path: "/api/music/:id" },
    create: {
      path: "/api/music",
      input: z.object({
        title: z.string(),
        artist: z.string(),
        genre: z.string().optional(),
        tags: z.string().optional(),
        lyrics: z.string().optional().nullable(),
        isAi: z.boolean().optional(),
        price: z.number().optional(),
        isDownloadable: z.boolean().optional(),
        imageFilename: z.string().optional().nullable(),
      }),
    },
    like: { path: "/api/music/:id/like" },
  },
  reviews: {
    list: { path: "/api/music/:id/reviews" },
    create: {
      path: "/api/music/:id/reviews",
      input: z.object({ content: z.string() }),
    },
  },
  musicStories: {
    list: { path: "/api/music/:id/stories" },
    create: {
      path: "/api/music/:id/stories",
      input: z.object({ content: z.string() }),
    },
    update: { path: "/api/music-stories/:id" },
    delete: { path: "/api/music-stories/:id" },
    getComments: { path: "/api/music-stories/:id/comments" },
    createComment: {
      path: "/api/music-stories/:id/comments",
      input: z.object({ content: z.string() }),
    },
  },
  playlists: {
    list: { path: "/api/playlists" },
    create: {
      path: "/api/playlists",
      input: z.object({ name: z.string() }),
    },
    addMusic: { path: "/api/playlists/:id/music" },
    get: { path: "/api/playlists/:id" },
  },
  posts: {
    list: { path: "/api/posts" },
    get: { path: "/api/posts/:id" },
    create: {
      path: "/api/posts",
      input: z.object({
        title: z.string(),
        content: z.string(),
        category: z.string().optional(),
        attachment: z.string().optional(),
      }),
    },
    getComments: { path: "/api/posts/:id/comments" },
    createComment: {
      path: "/api/posts/:id/comments",
      input: z.object({ content: z.string(), parentId: z.number().optional() }),
    },
  },
  users: {
    follow: {
      path: "/api/users/:id/follow",
      responses: { 200: { parse: (d: unknown) => d as { following: boolean } } },
    },
    getProfile: {
      path: "/api/users/:id/profile",
      responses: {
        200: {
          parse: (d: unknown) =>
            d as {
              user: unknown;
              uploadedMusic: unknown[];
              likedMusic: unknown[];
              followerCount: number;
              followingCount: number;
              playlists: unknown[];
              posts: unknown[];
              followers: unknown[];
              following: unknown[];
              isFollowing: boolean;
            },
        },
      },
    },
  },
  notifications: {
    list: {
      path: "/api/notifications",
      responses: { 200: { parse: (d: unknown) => d as unknown[] } },
    },
    markRead: {
      path: "/api/notifications/:id/read",
      responses: { 200: { parse: (d: unknown) => d as unknown } },
    },
  },
} as const;

export const errorSchemas = {};
