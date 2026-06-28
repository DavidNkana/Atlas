import { redirect } from "next/navigation";

/**
 * /land is now part of the main Atlas command bar.
 * All land verticals are available as chips on the home page.
 */
export default function LandPage() {
  redirect("/");
}
