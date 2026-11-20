// Public OAuth client ids (not secrets). Set them in .env.local / Vercel; see README.
export const CLIENT_IDS = {
  google: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  microsoft: import.meta.env.VITE_MICROSOFT_CLIENT_ID || '',
};
