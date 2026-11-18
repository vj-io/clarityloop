import type { Metadata } from "next";

export const metadata: Metadata = { title: "All tasks" };
export default function Layout({ children }: { children: React.ReactNode }) { return children; }
