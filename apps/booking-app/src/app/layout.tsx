export const metadata = {
  title: "Booking App API",
  description: "B2B Scheduling API powered by Cal.com",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
