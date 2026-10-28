import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Teledentistry Clinical Mentorship Platform',
  description: 'Real-time multi-feed remote clinical teledentistry and surgical mentorship platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="h-full overflow-hidden bg-slate-950 text-slate-100 flex flex-col">
        {children}
      </body>
    </html>
  );
}
