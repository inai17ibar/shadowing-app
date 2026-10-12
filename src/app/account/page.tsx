import type { Metadata } from "next";
import AccountClient from "./_components/account-client";

export const metadata: Metadata = {
  title: "アカウント | Shadowing Practice",
};

export default function AccountPage() {
  return <AccountClient />;
}
