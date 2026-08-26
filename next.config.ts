import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // A pasted screenshot or a phone photo of a whiteboard goes to Supabase
    // Storage through a Server Action (slice 09), and the default body limit
    // for an action is 1MB — which a phone photo clears easily. 6MB leaves
    // room above lib/files.ts's 5MB ceiling for the multipart envelope.
    //
    // Anything bigger than that is a Drive file, and Drive uploads go straight
    // from the browser to Google without touching this server at all.
    serverActions: { bodySizeLimit: '6mb' },
  },
};

export default nextConfig;
