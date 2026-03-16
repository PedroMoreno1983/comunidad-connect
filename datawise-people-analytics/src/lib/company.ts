import { prisma } from "@/lib/prisma";

export async function listCompanies() {
  return prisma.company.findMany({
    select: {
      id: true,
      name: true,
      industry: true,
      employeeCount: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}
