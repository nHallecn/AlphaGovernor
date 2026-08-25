import { PrismaClient, Prisma } from "@prisma/client";

const globalPrisma = globalThis as unknown as { alphaGovernorPrisma?: PrismaClient };
export const db = globalPrisma.alphaGovernorPrisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") globalPrisma.alphaGovernorPrisma = db;
export { Prisma, PrismaClient };
