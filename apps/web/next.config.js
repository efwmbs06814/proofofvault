/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@proof-of-vault/shared-types", "@appletosolutions/reactbits"],
  ...(process.platform === "win32" ? { outputFileTracing: false } : {}),
  experimental: {
    optimizePackageImports: ["react", "react-dom"]
  },
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    if (!target) {
      return [];
    }

    return [
      {
        source: "/backend/:path*",
        destination: `${target.replace(/\/+$/, "")}/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
