export default function LabelerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="h-screen flex overflow-hidden">{children}</div>;
}
