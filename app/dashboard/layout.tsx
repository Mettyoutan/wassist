import Navbar from "@/components/dashboard/Navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        maxWidth: "430px",
        margin: "0 auto",
        minHeight: "100vh",
        background: "white",
        boxShadow: "0 0 20px rgba(0,0,0,0.1)",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      <Navbar title="Beranda" />
      {children}
    </div>
  );
}
