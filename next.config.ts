import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma and the mailer stay out of the bundle; both are Node-only.
  serverExternalPackages: ["@prisma/client", "nodemailer"],
};

export default nextConfig;
