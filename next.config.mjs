/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3", "sqlite-vec"],
  devIndicators: false,
};
export default nextConfig;
