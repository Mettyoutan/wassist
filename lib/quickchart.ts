import type { TrendPoint } from "@/server/db";

export function buildRevenueChartUrl(points: TrendPoint[], period: string): string {
  const labels  = points.map(p => p.label);
  const values  = points.map(p => p.revenue);
  const maxVal  = Math.max(...values, 1);
  const hasData = values.some(v => v > 0);

  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Omzet",
        data: values,
        backgroundColor: hasData ? "rgba(37,211,102,0.85)" : "rgba(200,200,200,0.5)",
        borderColor: "rgba(7,94,84,1)",
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `Omzet ${period}`,
          font: { size: 14, weight: "bold" },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: maxVal * 1.3,
          ticks: {
            callback: (v: number) => `${Math.round(v / 1000)}rb`,
          },
        },
      },
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(config));
  return `https://quickchart.io/chart?w=600&h=300&bkg=white&c=${encoded}`;
}
