/**
 * Pure-SVG 12-month sparkline. Stroke + fill colors are seeded from the trend
 * direction — emerald for up, rose for down. No external charting library.
 */
export function Sparkline({
  data,
  width = 120,
  height = 32,
  className = "",
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (data.length < 2) {
    return (
      <div className={`text-xs text-muted ${className}`}>insufficient data</div>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const y = (v: number) => height - ((v - min) / range) * height;

  const path = data
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${y(v).toFixed(1)}`,
    )
    .join(" ");
  const fill = `${path} L${width.toFixed(1)},${height} L0,${height} Z`;
  const last = data[data.length - 1];
  const first = data[0];
  const trendUp = last >= first;

  const stroke = trendUp ? "rgb(5 150 105)" : "rgb(220 38 38)";
  const fillColor = trendUp ? "rgba(5,150,105,0.10)" : "rgba(220,38,38,0.08)";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden
    >
      <path d={fill} fill={fillColor} />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={(data.length - 1) * stepX}
        cy={y(last)}
        r={2}
        fill={stroke}
      />
    </svg>
  );
}
