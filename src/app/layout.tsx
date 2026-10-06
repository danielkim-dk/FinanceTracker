import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Penny · A little clarity for your money",
  description:
    "Your personal space to track income, expenses, and investment contributions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
