import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Alte Zeiterfassungs-Seite wurde archiviert – alte Links/Push/Mails landen im Kalender
  async redirects() {
    return [
      { source: '/zeiterfassung', destination: '/kalender', permanent: false },
    ]
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
};

export default nextConfig;
