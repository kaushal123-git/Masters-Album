import type {Metadata} from 'next';
import { Inter, Anton, Cormorant_Garamond } from 'next/font/google';
import './globals.css'; // Global styles

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const anton = Anton({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
});

const cormorant = Cormorant_Garamond({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-serif',
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'RoastRap AI',
  description: 'Get savage roasts and fire raps based on your day. Turn your chaos into bars.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${inter.variable} ${anton.variable} ${cormorant.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning className="antialiased font-sans">{children}</body>
    </html>
  );
}
