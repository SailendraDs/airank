import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

function getGaugeColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#f59e0b";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

export function CircularGauge({ score, size = 200 }: { score: number; size?: number }) {
  const s = Math.max(0, Math.min(100, score));
  const data = [{ value: s }, { value: 100 - s }];

  return (
    <div className="relative inline-flex items-center justify-center">
      <ResponsiveContainer width={size} height={size}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            startAngle={90}
            endAngle={-270}
            innerRadius={size * 0.35}
            outerRadius={size * 0.45}
            dataKey="value"
            stroke="none"
          >
            <Cell fill={getGaugeColor(s)} />
            <Cell fill="#e5e7eb" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-4xl font-bold text-gray-900">{s}</div>
        <div className="text-sm text-gray-500 font-medium">GEO Score</div>
      </div>
    </div>
  );
}

export function MiniGauge({
  score,
  label,
  color,
  size = 120,
}: {
  score: number;
  label: string;
  color?: string;
  size?: number;
}) {
  const s = Math.max(0, Math.min(100, score));
  const data = [{ value: s }, { value: 100 - s }];
  const gaugeColor = color || getGaugeColor(s);

  return (
    <div className="flex flex-col items-center space-y-2">
      <div className="relative">
        <ResponsiveContainer width={size} height={size}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              startAngle={90}
              endAngle={-270}
              innerRadius={size * 0.3}
              outerRadius={size * 0.4}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={gaugeColor} />
              <Cell fill="#f3f4f6" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-gray-900">{Math.round(s)}</span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-xs font-medium text-gray-700">{label}</div>
        <div className="text-xs text-gray-500">/ 100</div>
      </div>
    </div>
  );
}
