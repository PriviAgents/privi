import type { Metadata } from "next";
import { Dashboard } from "@/components/app/Dashboard";

export const metadata: Metadata = { title: "App" };

export default function AppPage() {
  return <Dashboard />;
}
