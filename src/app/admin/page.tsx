import type { Metadata } from "next";
import { AdminDashboard } from "@/components/app/AdminDashboard";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminDashboard />;
}
