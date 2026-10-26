import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Órbita Eleitoral | Apuração presidencial",
  description: "Órbita Eleitoral: apuração presidencial ao vivo, resultados por região e estado, projeções e dados oficiais do TSE.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}

