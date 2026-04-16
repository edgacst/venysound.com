import { z } from 'zod';
import { 
  insertMusicSchema, 
  insertReviewSchema, 
  insertPlaylistSchema, 
  insertPostSchema, 
  insertPostCommentSchema,
  insertMusicStorySchema,
  insertStoryCommentSchema,
  music,
  posts,
  playlists,
  reviews,
  notifications,
  postComments,
  musicStories,
  storyComments
} from './schema';

// ============================================
// SHARED ERROR SCHEMAS
// ============================================
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

// ============================================
// API CONTRACT
// ============================================
export const api = {
  music: {
    list: {
      method: 'GET' as const,
      path: '/api/music' as const,
      input: z.object({
        search: z.string().optional(),
        genre: z.string().optional(),
        page: z.string().optional(),
        limit: z.string().optional(),
      }).optional(),
      responses: {
        200: z.object({
          data: z.array(z.custom<typeof music.$inferSelect>()),
          total: z.number(),
        }),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/music/:id' as const,
      responses: {
        200: z.custom<typeof music.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/music' as const,
      input: insertMusicSchema,
      responses: {
        201: z.custom<typeof music.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    like: {
      method: 'POST' as const,
      path: '/api/music/:id/like' as const,
      responses: {
        200: z.object({ liked: z.boolean() }),
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
  },
  reviews: {
    create: {
      method: 'POST' as const,
      path: '/api/music/:id/reviews' as const,
      input: insertReviewSchema,
      responses: {
        201: z.custom<typeof reviews.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/music/:id/reviews' as const,
      responses: {
        200: z.array(z.custom<typeof reviews.$inferSelect>()),
      },
    },
  },
  playlists: {
    list: {
      method: 'GET' as const,
      path: '/api/playlists' as const,
      responses: {
        200: z.array(z.custom<typeof playlists.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/playlists' as const,
      input: insertPlaylistSchema,
      responses: {
        201: z.custom<typeof playlists.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    addMusic: {
      method: 'POST' as const,
      path: '/api/playlists/:id/music' as const,
      input: z.object({ musicId: z.number() }),
      responses: {
        200: z.object({ success: z.boolean() }),
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/playlists/:id' as const,
      responses: {
        200: z.custom<typeof playlists.$inferSelect & { musics: typeof music.$inferSelect[] }>(),
        404: errorSchemas.notFound,
      },
    },
  },
  posts: {
    list: {
      method: 'GET' as const,
      path: '/api/posts' as const,
      input: z.object({
        search: z.string().optional(),
        category: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof posts.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/posts/:id' as const,
      responses: {
        200: z.custom<typeof posts.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/posts' as const,
      input: insertPostSchema,
      responses: {
        201: z.custom<typeof posts.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    createComment: {
      method: 'POST' as const,
      path: '/api/posts/:id/comments' as const,
      input: insertPostCommentSchema,
      responses: {
        201: z.custom<typeof postComments.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    getComments: {
      method: 'GET' as const,
      path: '/api/posts/:id/comments' as const,
      responses: {
        200: z.array(z.custom<typeof postComments.$inferSelect>()),
      },
    },
  },
  musicStories: {
    list: {
      method: 'GET' as const,
      path: '/api/music/:id/stories' as const,
      responses: {
        200: z.array(z.any()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/music/:id/stories' as const,
      input: insertMusicStorySchema,
      responses: {
        201: z.custom<typeof musicStories.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/stories/:id' as const,
      input: z.object({ content: z.string().min(1) }),
      responses: {
        200: z.custom<typeof musicStories.$inferSelect>(),
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/stories/:id' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
    getComments: {
      method: 'GET' as const,
      path: '/api/stories/:id/comments' as const,
      responses: {
        200: z.array(z.any()),
      },
    },
    createComment: {
      method: 'POST' as const,
      path: '/api/stories/:id/comments' as const,
      input: insertStoryCommentSchema,
      responses: {
        201: z.custom<typeof storyComments.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
  },
  users: {
    follow: {
      method: 'POST' as const,
      path: '/api/users/:id/follow' as const,
      responses: {
        200: z.object({ following: z.boolean() }),
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
    getProfile: {
      method: 'GET' as const,
      path: '/api/users/:id/profile' as const,
      responses: {
        200: z.object({
          user: z.any(),
          uploadedMusic: z.array(z.custom<typeof music.$inferSelect>()),
          likedMusic: z.array(z.custom<typeof music.$inferSelect>()),
          followerCount: z.number(),
          followingCount: z.number(),
          playlists: z.array(z.any()),
          posts: z.array(z.any()),
          followers: z.array(z.any()),
          following: z.array(z.any()),
          isFollowing: z.boolean(),
        }),
        404: errorSchemas.notFound,
      },
    },
  },
  notifications: {
    list: {
      method: 'GET' as const,
      path: '/api/notifications' as const,
      responses: {
        200: z.array(z.custom<typeof notifications.$inferSelect>()),
        401: errorSchemas.unauthorized,
      },
    },
    markRead: {
      method: 'PATCH' as const,
      path: '/api/notifications/:id/read' as const,
      responses: {
        200: z.custom<typeof notifications.$inferSelect>(),
        401: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
