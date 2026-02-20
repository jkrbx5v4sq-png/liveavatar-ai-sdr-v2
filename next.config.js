/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://www.mshdigital.de https://mshdigital.de;"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
