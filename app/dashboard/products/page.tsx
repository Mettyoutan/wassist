import StockNotification from "@/components/dashboard/StockNotification";

const dummyStock = [
  {
    name: "Ayam Penyet",
    stock: 3,
    soldToday: 22,
    image: "/ayam_penyet.png",
    status: "menipis" as const,
  },
  {
    name: "Es Teh Manis",
    stock: 0,
    soldToday: 55,
    image: "/es_teh_manis.png",
    status: "habis" as const,
  },
  {
    name: "Tahu Goreng",
    stock: 6,
    soldToday: 0,
    image: "/tahu_goreng.png",
    status: "aman" as const,
  },
];

export default function StockManagement(){
    return (
        <StockNotification items={dummyStock} />
    )
}