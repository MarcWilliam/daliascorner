import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
export const metadata: Metadata = {
  title: "Store admin | Dalia’s Corner",
  robots: { index: false, follow: false },
  manifest: "/admin.webmanifest",
};
export default function AdminPage() {
  return <AdminDashboard />;
}
