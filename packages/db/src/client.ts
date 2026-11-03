import { PrismaClient } from "@prisma/client";

const SOFT_DELETE_MODELS = ["User", "Passenger", "Booking", "PriceWatch", "SavedHotel"];
const READ_OPS = ["findMany", "findFirst", "findFirstOrThrow", "count"];

const g = globalThis as unknown as { __prisma?: PrismaClient };
export const prisma = g.__prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.__prisma = prisma;

/**
 * Prisma client with soft-delete filtering: reads on soft-delete models hide rows
 * with `deletedAt` set unless the caller passes an explicit `deletedAt` filter.
 * `findUnique` is not filtered (it only accepts unique fields); use `findFirst` for user-facing lookups.
 */
export const db = prisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (SOFT_DELETE_MODELS.includes(model) && READ_OPS.includes(operation)) {
          const a = args as { where?: Record<string, unknown> };
          a.where = { deletedAt: null, ...a.where };
        }
        return query(args);
      },
    },
  },
});
