import { CustomerPortal } from "@/components/customer/CustomerPortal";
export const metadata = {
  title: "My orders | Dalia’s Corner",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function Page() {
  return <CustomerPortal />;
}
