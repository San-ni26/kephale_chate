"use client";

import dynamic from "next/dynamic";

// useSearchParams() requires a Suspense boundary AND no SSR to avoid hydration mismatch.
// dynamic + ssr:false completely skips server rendering for this component.
const FeedPageContent = dynamic(() => import("./feed-content"), { ssr: false });

export default function FeedPage() {
    return <FeedPageContent />;
}
