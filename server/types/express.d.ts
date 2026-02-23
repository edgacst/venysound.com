declare namespace Express {
  interface User {
    claims: {
      sub: string;
      email: string | null;
      first_name: string;
      last_name: string;
      profile_image_url: string;
    };
    access_token: string;
    refresh_token?: string;
    expires_at: number;
  }
}
