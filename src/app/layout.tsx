import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeRobot Labeler",
  description: "Dataset labeling tool for LeRobot datasets",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0B0B0D] text-[#D3D5FD] antialiased" style={{ fontFamily: "'Fantasque Sans Mono', monospace" }}>
        {children}
      </body>
    </html>
  );
}
