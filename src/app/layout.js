import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "LifeLog | Smart Diet Tracker",
  description: "AI-powered diet tracking application",
  manifest: "/manifest.json",
  icons: {
    apple: "/apple-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LifeLog",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Prevent zooming on inputs for native app feel
  themeColor: "#000000",
};

import { AuthProvider } from "@/lib/contexts/AuthContext";

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <head>
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AuthProvider>
          {children}
        </AuthProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js')
                    .then(reg => console.log('[SW] registered:', reg.scope))
                    .catch(err => console.warn('[SW] registration failed:', err));
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
