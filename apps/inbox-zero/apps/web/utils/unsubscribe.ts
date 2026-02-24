import { addDays } from "date-fns/addDays";
import { generateSecureToken } from "./api-key";
import prisma from "./prisma";

export async function createUnsubscribeToken({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const token = generateSecureToken();

  await prisma.emailToken.create({
    data: {
      token,
      emailAccountId,
      expiresAt: addDays(new Date(), 30),
    },
  });

  return token;
}
