import "./globals.css";
import Link from "next/link";
import { Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
import { ThemeToggle } from "@/components/ThemeToggle";

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = { title: "memoria", description: "AI-organized personal notes" };

const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&m))document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning className={`${notoSansJp.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <header className="border-b bg-white dark:bg-neutral-900 dark:border-neutral-800">
          <nav className="mx-auto flex max-w-[2400px] items-center gap-4 p-4">
            <Link href="/" className="font-bold text-lg">memoria</Link>
            <div className="ml-auto"><ThemeToggle /></div>
          </nav>
        </header>
        <main className="mx-auto max-w-[2400px] p-4">{children}</main>
      </body>
    </html>
  );
}
