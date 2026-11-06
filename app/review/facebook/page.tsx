import { FacebookReview } from "@/components/customer/FacebookReview";
export const metadata = {
  title: "Facebook Login review | Dalia’s Corner",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function Page() {
  return <FacebookReview />;
}
