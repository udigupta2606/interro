import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Interro — AI Interview Prep",
  description: "Upload your resume. Get grilled like a real MAANG interview.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  );
}
