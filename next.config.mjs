/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3", "sqlite-vec", "@azure/identity"],
  devIndicators: false,
};
export default nextConfig;
