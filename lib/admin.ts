import "server-only";

import { currentUser } from "@clerk/nextjs/server";

/** Keep this allowlist server-side; never accept an admin flag from a client. */
export const ADMIN_EMAILS = new Set(["nkanadavid74@gmail.com"]);

export async function isVerifiedAdmin(): Promise<boolean> {
  const user = await currentUser();
  const primaryEmail = user?.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  );

  return Boolean(
    primaryEmail?.emailAddress &&
      primaryEmail.verification?.status === "verified" &&
      ADMIN_EMAILS.has(primaryEmail.emailAddress.trim().toLowerCase()),
  );
}
