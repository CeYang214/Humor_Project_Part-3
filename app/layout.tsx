import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Humor Admin Area",
  description: "Caption creation, rating, and humor admin workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
