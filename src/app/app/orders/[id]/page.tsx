import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderPage } from "@/components/app/OrderPage";

export const metadata: Metadata = { title: "Order" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OrderPage />
    </Suspense>
  );
}
